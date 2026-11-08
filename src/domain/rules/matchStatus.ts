import type { MatchCardStatus } from "../entities/matchCard.js";

/**
 * ユーザーフィードバック(2026-11-08): start.ggのセットの状態は
 * 未着手 → 呼び出し中(黄色、CALLED) → 進行中(緑、ACTIVE) → 完了 の順に
 * 進む。大会では「呼び出してから(選手がそろったのを)確認して進行中に
 * する」流れのため、状態の前後関係をこの順序で判定する(同期のマージで、
 * ローカルの未送信の状態とstart.gg側のどちらが進んでいるかの比較等)。
 */
const STATUS_RANK: Record<MatchCardStatus, number> = {
  NOT_STARTED: 0,
  CALLED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
};

export function statusRank(status: MatchCardStatus): number {
  return STATUS_RANK[status];
}

/**
 * 対戦台を実際に使っている(使い始める)状態か。呼び出し中の対戦も、
 * 選手がその卓へ向かっているため進行中と同様に卓を占有する。
 */
export function isTableInUse(status: MatchCardStatus): boolean {
  return status === "CALLED" || status === "IN_PROGRESS";
}
