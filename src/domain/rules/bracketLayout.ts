import type { MatchCard } from "../entities/matchCard.js";
import { type BracketSide, groupBySideAndRound } from "./bracketGrouping.js";

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
        a.identifier.localeCompare(b.identifier),
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
