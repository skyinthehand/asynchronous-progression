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
/** card.winnerIdを前提にロック判定する、後続の対戦カード一覧(computeIsLockedと同じ述語)。 */
function findLockingCards(
  card: MatchCard,
  allCardsInPool: MatchCard[],
): MatchCard[] {
  if (!card.winnerId) {
    return [];
  }
  return allCardsInPool.filter((other) => {
    if (other.id === card.id) return false;
    if (Math.abs(other.round) <= Math.abs(card.round)) return false;
    const involvesWinner =
      other.entrant1Id === card.winnerId || other.entrant2Id === card.winnerId;
    return involvesWinner && other.status !== "NOT_STARTED";
  });
}

export function computeIsLocked(
  card: MatchCard,
  allCardsInPool: MatchCard[],
): boolean {
  return findLockingCards(card, allCardsInPool).length > 0;
}

/**
 * artifact更新(2026-10-17): ロックの注意書きを鍵マーク(クリックで開閉する
 * ツールチップ)に出し分けるための文言。どの対戦カードが原因でロックされて
 * いるか(識別子)・それが進行中か終了済みかを、モックアップと同じ形で
 * 組み立てる。`card.isLocked`が直接(computeIsLockedを介さず)trueに設定
 * されている場合等、card.winnerIdからは原因となる対戦カードを再現できない
 * ことがあるため、その場合は識別子を含まない一般的な文言にフォールバックする。
 */
export function lockedTooltipText(
  card: MatchCard,
  allCardsInPool: MatchCard[],
): string {
  const lockers = findLockingCards(card, allCardsInPool);
  if (lockers.length === 0) {
    return "後続の対戦が進行しているため、この結果は修正できません。";
  }
  const ids = lockers.map((c) => c.identifier).join("・");
  const anyLive = lockers.some((c) => c.status === "IN_PROGRESS");
  return `後続の対戦（Set ${ids}）が${anyLive ? "進行している" : "終わっている"}ため、この結果は修正できません。`;
}
