import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-018: プール内の全対戦が完了した選手を判別する。
 * 対象選手が関与する対戦カードが1件も無い場合は判定不能として false を返す。
 */
export function computePoolFinished(
  entrantId: string,
  matchCards: MatchCard[],
): boolean {
  const relevant = matchCards.filter(
    (card) => card.entrant1Id === entrantId || card.entrant2Id === entrantId,
  );
  if (relevant.length === 0) {
    return false;
  }
  return relevant.every((card) => card.status === "COMPLETED");
}
