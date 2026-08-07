import { useSyncStatus } from "./useSyncStatus.js";

/** FR-016: 同期不良が続いた場合にスナックバーで通知する。 */
export function SyncStatusSnackbar() {
  const status = useSyncStatus();

  if (!status?.isStale) {
    return null;
  }

  const notYetSynced = !status.lastSuccessAt;

  return (
    <output className="sync-status-snackbar no-print">
      {notYetSynced
        ? "startggとの初回同期にまだ成功していません。"
        : `startggとの同期がしばらく成功していません(未反映${status.pendingChangeCount}件)。`}
      ネットワーク接続をご確認ください。
      {status.lastFailureReason && (
        <span className="sync-status-reason">
          {" "}
          詳細: {status.lastFailureReason}
        </span>
      )}
    </output>
  );
}
