import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-022: 修正対象の結果を前提とする後続の対戦が既に進行している場合、
 * その結果の修正を禁止する。
 *
 * 「後続の対戦」は、対象カードの勝者が次に対戦するカードとして扱う
 * (Assumptions: 「後続の試合が進行している」の定義)。正確なブラケットの
 * 勝者送り先(progression seed)は現行データモデルでは保持していないため、
 * 「対象カードの勝者が、より後のラウンドの別カードに参加者として現れており、
 * かつそのカードが未着手でない」ことをもって後続進行済みと判定する。
 */
export function computeIsLocked(
  card: MatchCard,
  allCardsInPool: MatchCard[],
): boolean {
  if (!card.winnerId) {
    return false;
  }
  return allCardsInPool.some((other) => {
    if (other.id === card.id) return false;
    if (Math.abs(other.round) <= Math.abs(card.round)) return false;
    const involvesWinner =
      other.entrant1Id === card.winnerId || other.entrant2Id === card.winnerId;
    return involvesWinner && other.status !== "NOT_STARTED";
  });
}
