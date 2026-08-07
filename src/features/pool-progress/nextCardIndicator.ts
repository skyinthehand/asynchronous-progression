import type { MatchCard } from "../../domain/entities/matchCard.js";

/**
 * FR-009: 次に進行すべき対戦カードを一目で判別できるようにする。
 * ラウンド→識別子の順で最も早い、未着手のカードを次カードとする。
 */
export function findNextMatchCard(cards: MatchCard[]): MatchCard | null {
  const pending = cards.filter((card) => card.status === "NOT_STARTED");
  if (pending.length === 0) {
    return null;
  }
  return [...pending].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.identifier.localeCompare(b.identifier);
  })[0];
}
