import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-022: 修正対象の結果を前提とする後続の対戦が既に進行している場合、
 * その結果の修正を禁止する。
 *
 * 「後続の対戦」は、対象カードの勝者が次に対戦するカードとして扱う
 * (Assumptions: 「後続の試合が進行している」の定義)。「対象カードの勝者が、
 * より後のラウンドの別カードに参加者として現れており、かつそのカードが
 * 未着手でない」ことをもって後続進行済みと判定する。2026-11-09以降は、
 * 対象カードを出場元として直接参照する後続の対戦(敗者の行き先を含む)が
 * 未着手でない場合も後続進行済みとする。
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
    if (other.status === "NOT_STARTED") return false;
    // ユーザーフィードバック(2026-11-09): この対戦の結果(勝者・敗者の
    // どちらでも)を出場元として直接受け取る後続の対戦(entrant1/2Source
    // MatchId)が始まっていれば修正不可にする。以前は勝者の後の対戦しか
    // 見ておらず、敗者が落ちた敗者側の対戦が進んでいても修正できてしまい、
    // 修正の送信(start.ggのresetSet→報告し直し)と食い違う恐れがあった。
    const isDirectSuccessor =
      other.entrant1SourceMatchId === card.id ||
      other.entrant2SourceMatchId === card.id;
    if (isDirectSuccessor) return true;
    if (Math.abs(other.round) <= Math.abs(card.round)) return false;
    return (
      other.entrant1Id === card.winnerId || other.entrant2Id === card.winnerId
    );
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
  // 呼び出し中(CALLED)も、まだ終わっていない(進行している)側に含める。
  const anyLive = lockers.some((c) => c.status !== "COMPLETED");
  return `後続の対戦（Set ${ids}）が${anyLive ? "進行している" : "終わっている"}ため、この結果は修正できません。`;
}

/**
 * ユーザーフィードバック(2026-10-20): `isLocked`は従来、アプリで結果を
 * 入力したとき(usePoolProgressのrecordResult)にしか再計算されず、後続の
 * 対戦がstart.gg側で開始・完了・リセットされてもロック状態が追従しな
 * かった。同期・読み込みのたびにこの関数で全カードを再計算する。
 * 変化のないカードは同じオブジェクトのまま返す(呼び出し側で変更の有無を
 * 参照比較で判定できるように)。
 */
export function recomputeIsLocked(allCardsInPool: MatchCard[]): MatchCard[] {
  return allCardsInPool.map((card) => {
    const isLocked = computeIsLocked(card, allCardsInPool);
    return isLocked === card.isLocked ? card : { ...card, isLocked };
  });
}
