import { useState } from "react";
import { formatAwayStartedAt as formatJstTime } from "../domain/rules/awayPeriodFormat.js";
import { NoticeViewer } from "../features/notice/NoticeViewer.js";
import { PoolProgressScreen } from "../features/pool-progress/PoolProgressScreen.js";
import { runSync } from "../features/sync/syncRunner.js";
import { useSyncStatus } from "../features/sync/useSyncStatus.js";
import { useAppMode } from "./router.js";

/**
 * デザイン刷新(2026-10-09): モックアップのヘッダー(ロゴ+タイトル+同期状態
 * チップ+注意書き/印刷/管理画面ボタン)。同期状態チップは既存の
 * `useSyncStatus()`(`SyncStatus.isStale`/`pendingChangeCount`/
 * `lastSuccessAt`)からそのまま導出する(新しいロジックは追加しない)。
 */
function syncChip(status: ReturnType<typeof useSyncStatus>) {
  const sub = status?.lastSuccessAt
    ? `最終同期 ${formatJstTime(status.lastSuccessAt)}`
    : "未同期";
  if (!status || status.isStale) {
    return { dotCls: "dot failed", label: "同期不良", sub };
  }
  if (status.pendingChangeCount > 0) {
    return {
      dotCls: "dot pending",
      label: `反映待ち ${status.pendingChangeCount}件`,
      sub,
    };
  }
  return { dotCls: "dot ok", label: "同期済み", sub };
}

/**
 * ユーザーフィードバック(2026-10-18): 管理画面に入らなくても、同期済み
 * 表示の横からその場でstart.ggへ手動で同期できるようにする
 * (既存のAdminModeScreen.tsxの「データを再取得」と同じrunSync()を使う)。
 */
function ManualSyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setSyncing(true);
    setMessage(null);
    const result = await runSync();
    setSyncing(false);
    setMessage(
      result.success ? "同期しました" : `同期に失敗しました: ${result.error}`,
    );
  }

  return (
    <>
      <button
        type="button"
        className="header-sync-refresh no-print"
        onClick={handleClick}
        disabled={syncing}
        aria-label={syncing ? "同期中…" : "今すぐ同期"}
        title={syncing ? "同期中…" : "今すぐ同期"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      {message && (
        <output className="mono header-sync-message no-print">{message}</output>
      )}
    </>
  );
}

/**
 * 進行担当者向けの一般モード画面。次戦案内(US4)・結果修正(US6)・
 * 印刷(US7)は、実装が進むにつれてここに組み込まれる。
 */
export function GeneralModeScreen() {
  const { enterAdminMode } = useAppMode();
  const syncStatus = useSyncStatus();
  const sync = syncChip(syncStatus);

  return (
    <div className="screen general-mode-screen">
      <header className="screen-header">
        <div className="header-brand">
          <span className="header-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span className="header-mark-accent" />
          </span>
          <h1>予選プール進行</h1>
        </div>
        <div className="header-sync-chip" aria-live="polite">
          <span className={sync.dotCls} />
          <span className="header-sync-label">{sync.label}</span>
          <span className="mono header-sync-sub no-print">{sync.sub}</span>
        </div>
        <ManualSyncButton />
        <div className="header-spacer" />
        <nav aria-label="メニュー" className="header-nav no-print">
          <NoticeViewer />
          <button
            type="button"
            disabled
            aria-label="印刷用ページ"
            title="印刷用ページ"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 9V3h12v6" />
              <rect x="3" y="9" width="18" height="8" />
              <path d="M6 14h12v7H6z" />
            </svg>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={enterAdminMode}
          >
            管理画面
          </button>
        </nav>
      </header>
      <PoolProgressScreen />
    </div>
  );
}
