/**
 * FR-015/FR-016: 定期同期の既定間隔と、同期不良とみなす閾値時間。
 * spec.mdのAssumptionsで既定値は仕様外とされているため、実装上の妥当な
 * 既定値として本モジュールで定義する(運営が変更したい場合は、この定数を
 * 差し替えるかfeature-flag化を検討する)。
 */
export const SYNC_INTERVAL_MS = 60_000;
export const STALE_THRESHOLD_MS = 5 * 60_000;

interface DeriveIsStaleParams {
  lastSuccessAt: string | null;
  /** 初回同期(データ取得)自体の失敗をサイレントにしないために追加。 */
  lastFailureAt?: string | null;
  pendingChangeCount: number;
  now?: Date;
}

/**
 * SyncStatus.isStale導出ロジック(data-model.md 8.)。
 *
 * - 一度も同期に成功していない場合: 明示的な失敗履歴がある、または
 *   未反映のローカル変更がある場合にstale(初回のデータ取得自体が
 *   失敗しているケースを、ローカルに未反映の変更が無くても確実に
 *   気づけるようにする)。
 * - 一度でも成功している場合: 未反映の変更があり、かつ最終成功同期からの
 *   経過時間が閾値以上の場合にstale。未反映の変更がなければ、接続状況に
 *   かかわらず失われるデータがないためstaleとしない。
 */
export function deriveIsStale({
  lastSuccessAt,
  lastFailureAt = null,
  pendingChangeCount,
  now = new Date(),
}: DeriveIsStaleParams): boolean {
  if (!lastSuccessAt) {
    return lastFailureAt !== null || pendingChangeCount > 0;
  }
  if (pendingChangeCount === 0) {
    return false;
  }
  const elapsedMs = now.getTime() - new Date(lastSuccessAt).getTime();
  return elapsedMs >= STALE_THRESHOLD_MS;
}
