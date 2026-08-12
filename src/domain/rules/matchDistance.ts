import type { MatchCard } from "../entities/matchCard.js";

type BracketSide = "WINNERS" | "LOSERS";

function sideOf(card: MatchCard): BracketSide {
  return card.bracketSide === "LOSERS" ? "LOSERS" : "WINNERS";
}

/**
 * 対戦カードの「プール抜けからの遠さ」(次戦サジェストの優先順位算出用、
 * FR-002〜FR-004)を算出する。勝敗ブラケット形式(bracketSideが
 * WINNERS/LOSERSのカードを1件でも含む)以外のプール(総当り等)では
 * 空のMapを返す(呼び出し側は既存のround→identifierフォールバックを使う、
 * FR-008)。
 *
 * 各側(勝者側/敗者側)ごとに、その側でラウンド(Math.abs(round))が
 * 最も進んだ対戦(プール抜けを決定づける対戦)を距離1の基準点とし、
 * そこからentrant1SourceMatchId/entrant2SourceMatchId(出場元)を逆方向に
 * たどる多始点BFSで、対戦カードIDから距離への対応表を作る。ある対戦の
 * 出場元は勝者の進出先・敗者の進出先の双方になり得る(例: 勝者側の対戦の
 * 敗者が敗者側の対戦に落ちる)ため、複数経路が存在する場合はBFSにより
 * 自動的に最短(=基準点により近い)距離が採用される(FR-003の
 * 「いずれか近い方」)。
 */
export function computeMatchDistances(
  matchCards: MatchCard[],
): Map<string, number> {
  const hasBracketSide = matchCards.some(
    (card) => card.bracketSide === "WINNERS" || card.bracketSide === "LOSERS",
  );
  if (!hasBracketSide) return new Map();

  const cardById = new Map(matchCards.map((card) => [card.id, card]));

  const maxRoundBySide = new Map<BracketSide, number>();
  for (const card of matchCards) {
    const side = sideOf(card);
    const round = Math.abs(card.round);
    const current = maxRoundBySide.get(side);
    if (current === undefined || round > current) {
      maxRoundBySide.set(side, round);
    }
  }

  const distances = new Map<string, number>();
  const queue: string[] = [];
  for (const card of matchCards) {
    const maxRound = maxRoundBySide.get(sideOf(card));
    if (maxRound !== undefined && Math.abs(card.round) === maxRound) {
      distances.set(card.id, 1);
      queue.push(card.id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const currentId = queue[head++];
    const currentCard = cardById.get(currentId);
    const currentDistance = distances.get(currentId);
    if (!currentCard || currentDistance === undefined) continue;
    for (const sourceId of [
      currentCard.entrant1SourceMatchId,
      currentCard.entrant2SourceMatchId,
    ]) {
      if (sourceId === null || distances.has(sourceId)) continue;
      distances.set(sourceId, currentDistance + 1);
      queue.push(sourceId);
    }
  }

  return distances;
}
