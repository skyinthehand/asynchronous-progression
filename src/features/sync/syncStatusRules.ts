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
  pendingChangeCount: number;
  now?: Date;
}

/**
 * SyncStatus.isStale導出ロジック(data-model.md 8.)。
 * 未反映の変更があり、かつ最終成功同期からの経過時間が閾値以上の場合に
 * 真となる。未反映の変更がない場合は、接続状況にかかわらず失われるデータが
 * ないため真としない。
 */
export function deriveIsStale({
  lastSuccessAt,
  pendingChangeCount,
  now = new Date(),
}: DeriveIsStaleParams): boolean {
  if (pendingChangeCount === 0) {
    return false;
  }
  if (!lastSuccessAt) {
    return true;
  }
  const elapsedMs = now.getTime() - new Date(lastSuccessAt).getTime();
  return elapsedMs >= STALE_THRESHOLD_MS;
}
