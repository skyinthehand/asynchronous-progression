import { useSyncStatus } from "./useSyncStatus.js";

/**
 * FR-016: 同期不良が続いた場合にスナックバーで通知する。
 *
 * ユーザーフィードバック(2026-08-14): 画面上部に固定表示する(以前は
 * 下部に通常のフロー内表示だったため、ページスクロールで見えなくなる
 * ことがあった。固定表示自体はglobal.cssの.sync-status-snackbar参照)。
 * 自動的に消す挙動は不要とのフィードバックのため、isStaleである限り
 * 表示し続ける。
 */
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
        // エラー詳細(startgg APIの生レスポンス等)は長く邪魔になるため、
        // 既定では閉じておき、開かないと見えないようにする。
        <details className="sync-status-reason">
          <summary>詳細</summary>
          {status.lastFailureReason}
        </details>
      )}
    </output>
  );
}
