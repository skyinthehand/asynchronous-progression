import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-014: 指定した対戦台番号に、未完了(`status !== "COMPLETED"`)の対戦
 * カードが既に割り当てられている場合、そのカードを返す(なければnull)。
 * `excludeCardId`を指定した場合、そのカード自身は判定対象から除く(自分の
 * 対戦台番号を変更しない更新を「占有中」と誤判定しないため)。
 *
 * `status === "IN_PROGRESS"`のみを占有中とみなさないのは、「進行中」への
 * 明示的な変更は任意(FR-010)であり、未着手のまま実際にプレイ中の対戦の
 * 対戦台を「空き」と誤判定しないため(research.md #3)。
 */
export function findOccupyingMatchCard(
  tableNumber: string,
  matchCards: MatchCard[],
  excludeCardId?: string,
): MatchCard | null {
  return (
    matchCards.find(
      (card) =>
        card.id !== excludeCardId &&
        card.tableNumber === tableNumber &&
        card.status !== "COMPLETED",
    ) ?? null
  );
}

export function isTableOccupied(
  tableNumber: string,
  matchCards: MatchCard[],
  excludeCardId?: string,
): boolean {
  return (
    findOccupyingMatchCard(tableNumber, matchCards, excludeCardId) !== null
  );
}
