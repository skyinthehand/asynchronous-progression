import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-014: 指定した対戦台番号に、進行中(`status === "IN_PROGRESS"`)の対戦
 * カードが既に割り当てられている場合、そのカードを返す(なければnull)。
 * `excludeCardId`を指定した場合、そのカード自身は判定対象から除く(自分の
 * 対戦台番号を変更しない更新を「占有中」と誤判定しないため)。
 *
 * ユーザーフィードバック(2026-10-19): 対戦者が未確定の段階でも対戦台を
 * 事前に割り当てられるようになったため、NOT_STARTEDの対戦カード同士は
 * 同じ対戦台番号を共有していても「占有中」として選択をブロックしない
 * (プールの対戦台数より対戦カード数が多いのが通常であり、実際にその卓を
 * 使って対戦が進行中でない限り、他のNOT_STARTEDの対戦カードにも同じ
 * 対戦台を仮に割り当てておきたいことがあるため)。実際にその卓を使って
 * 対戦中(IN_PROGRESS)の場合のみ、他のカードからの選択をブロックする。
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
        card.status === "IN_PROGRESS",
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
