import type { MatchCard } from "../entities/matchCard.js";
import { type BracketSide, groupBySideAndRound } from "./bracketGrouping.js";

const SPREADSHEET_IDENTIFIER = /^[A-Za-z]+$/;

/**
 * startggの対戦識別子(A, B, ..., Z, AA, AB, ...)をExcel/スプレッドシートの
 * 列名と同じ base-26 の通し番号に変換する。単純な文字列比較(localeCompare)
 * だと "AA" が "Z" より前に来てしまい(A<Zのため)、26試合を超える大きな
 * プールでラウンド1の並び順、ひいてはそれを基に平均計算する後続ラウンドの
 * 縦位置まで崩れてしまう(実際に報告されたバグ)。
 */
function spreadsheetRank(identifier: string): number {
  let rank = 0;
  for (const char of identifier.toUpperCase()) {
    rank = rank * 26 + (char.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return rank;
}

/**
 * ラウンド1(出場元カードの情報がなく、識別子の並び順に頼らざるを得ない
 * ラウンド)向けの比較関数。A〜Z・AA〜AZ...のような純粋な英字の識別子は
 * スプレッドシート式の順位で比較し、そうでない識別子(自前生成の
 * "R1-1"形式など)は従来通り文字列比較にフォールバックする。
 */
function compareIdentifiers(a: string, b: string): number {
  if (SPREADSHEET_IDENTIFIER.test(a) && SPREADSHEET_IDENTIFIER.test(b)) {
    return spreadsheetRank(a) - spreadsheetRank(b);
  }
  return a.localeCompare(b);
}

export interface BracketMatchLayout {
  card: MatchCard;
  round: number;
  /**
   * ラウンド内での縦位置。同じ側のラウンドをまたいで比較可能な相対値
   * (対戦相手の出場元カードの位置の平均から算出するため、小数になりうる)。
   */
  slot: number;
}

export interface BracketConnector {
  fromMatchId: string;
  fromRoundIndex: number;
  fromSlot: number;
  toMatchId: string;
  toRoundIndex: number;
  toSlot: number;
}

/** 別の側(勝者側→敗者側への"落ち"等)から出場者が来ていることを示す注記。 */
export interface BracketCrossSideOrigin {
  toMatchId: string;
  fromMatchId: string;
  fromIdentifier: string;
  fromSide: BracketSide;
}

export interface BracketSideLayout {
  side: BracketSide;
  rounds: number[];
  matchesByRound: Map<number, BracketMatchLayout[]>;
  connectors: BracketConnector[];
  crossSideOrigins: BracketCrossSideOrigin[];
}

/**
 * FR-023: startggのブラケット表示に合わせ、対戦カードを勝者側/敗者側の
 * トーナメント木(ラウンド列 × 縦位置)として配置する。各カードの縦位置は、
 * 出場元カード(entrant1/entrant2SourceMatchId)の位置の平均から算出し、
 * 対戦をつなぐ線(connectors)の描画に利用する。出場元カードが別の側
 * (勝者側の敗者が敗者側に落ちる等)の場合は、線ではなく注記として返す
 * (画面を分けて表示するため、側をまたぐ結線は対象外)。
 */
export function computeBracketLayout(
  matchCards: MatchCard[],
): BracketSideLayout[] {
  const grouped = groupBySideAndRound(matchCards);
  const cardById = new Map(matchCards.map((card) => [card.id, card]));
  const positionByMatchId = new Map<string, number>();
  const layouts: BracketSideLayout[] = [];

  for (const side of ["WINNERS", "LOSERS"] as const) {
    const roundsMap = grouped[side];
    const rounds = [...roundsMap.keys()].sort((a, b) => a - b);
    if (rounds.length === 0) continue;

    const matchesByRound = new Map<number, BracketMatchLayout[]>();
    const connectors: BracketConnector[] = [];
    const crossSideOrigins: BracketCrossSideOrigin[] = [];

    rounds.forEach((round, roundIndex) => {
      const cardsInRound = [...(roundsMap.get(round) ?? [])].sort((a, b) =>
        compareIdentifiers(a.identifier, b.identifier),
      );
      const layoutForRound: BracketMatchLayout[] = [];
      let fallbackIndex = 0;

      for (const card of cardsInRound) {
        const sourceIds = [
          card.entrant1SourceMatchId,
          card.entrant2SourceMatchId,
        ].filter((id): id is string => id !== null);
        const resolvedPositions = sourceIds
          .map((id) => positionByMatchId.get(id))
          .filter((position): position is number => position !== undefined);

        const slot =
          roundIndex === 0 || resolvedPositions.length === 0
            ? fallbackIndex++
            : resolvedPositions.reduce((sum, p) => sum + p, 0) /
              resolvedPositions.length;

        positionByMatchId.set(card.id, slot);
        layoutForRound.push({ card, round, slot });

        for (const sourceId of sourceIds) {
          const sourceCard = cardById.get(sourceId);
          const sourcePosition = positionByMatchId.get(sourceId);
          if (!sourceCard || sourcePosition === undefined) continue;
          const sourceSide: BracketSide =
            sourceCard.bracketSide === "LOSERS" ? "LOSERS" : "WINNERS";
          if (sourceSide === side) {
            connectors.push({
              fromMatchId: sourceCard.id,
              fromRoundIndex: rounds.indexOf(Math.abs(sourceCard.round)),
              fromSlot: sourcePosition,
              toMatchId: card.id,
              toRoundIndex: roundIndex,
              toSlot: slot,
            });
          } else {
            crossSideOrigins.push({
              toMatchId: card.id,
              fromMatchId: sourceCard.id,
              fromIdentifier: sourceCard.identifier,
              fromSide: sourceSide,
            });
          }
        }
      }

      matchesByRound.set(round, layoutForRound);
    });

    layouts.push({
      side,
      rounds,
      matchesByRound,
      connectors,
      crossSideOrigins,
    });
  }

  return layouts;
}
