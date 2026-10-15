import { type ReactNode, useEffect, useState } from "react";
import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { useAdminSession } from "../features/admin/AdminSessionContext.js";
import { InitLogin } from "../features/admin/InitLogin.js";
import { NoticeAdminPanel } from "../features/admin/NoticeAdminPanel.js";
import { PoolSelection } from "../features/admin/PoolSelection.js";
import { ResetDataButton } from "../features/admin/ResetDataButton.js";
import { TableSettingsPanel } from "../features/admin/TableSettingsPanel.js";
import { TokenSettings } from "../features/admin/TokenSettings.js";
import { runSync } from "../features/sync/syncRunner.js";
import { useAppMode } from "./router.js";

/**
 * ユーザーフィードバック(2026-08-13): start.gg側で「Start Bracket」を
 * 押した後、次の定期同期(最大60秒後)を待たずにすぐデータを取り込める
 * ようにする。通常のバックグラウンド同期(syncScheduler.ts)と同じ
 * runSync()をその場で実行するだけの薄いボタン。
 */
function RefetchDataButton() {
  const [refetching, setRefetching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefetch() {
    setRefetching(true);
    setMessage(null);
    const result = await runSync();
    setRefetching(false);
    setMessage(
      result.success
        ? "データを再取得しました。"
        : `再取得に失敗しました: ${result.error}`,
    );
  }

  return (
    <div className="refetch-data-panel">
      <button
        type="button"
        className="btn-primary"
        onClick={handleRefetch}
        disabled={refetching}
      >
        {refetching ? "再取得中…" : "データを再取得"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** デザイン刷新(2026-10-09): ヘッダーの「自動ログアウトまで」カウントダウン。 */
function useRemainingSessionTime(expiresAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

interface AdminSectionProps {
  number: string;
  title: string;
  children: ReactNode;
  danger?: boolean;
}

/** デザイン刷新(2026-10-09): モックアップ(Admin.dc.html)の番号付きセクション。 */
function AdminSection({ number, title, children, danger }: AdminSectionProps) {
  return (
    <section
      className="sec"
      style={danger ? { borderTopColor: "var(--warn)" } : undefined}
    >
      <div className="sec-h">
        <span
          className="sec-n"
          style={danger ? { color: "var(--warn)" } : undefined}
        >
          {number}
        </span>
        <h2 style={danger ? { color: "var(--warn)" } : undefined}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AdminModeContent() {
  const { exitAdminMode } = useAppMode();
  const { logout, expiresAt } = useAdminSession();
  const remaining = useRemainingSessionTime(expiresAt);
  // TableSettingsPanelはマウント時に一度だけ対象プールを読み込むため、
  // InitLogin/PoolSelectionで対象プールが変わったらkeyを変えて
  // 強制的に再マウント(再読み込み)させる。これがないと、対戦台設定が
  // 一般モードへ一度戻るまで反映されない不具合になる。
  const [poolRefreshKey, setPoolRefreshKey] = useState(0);
  const refreshTablePanel = () => setPoolRefreshKey((key) => key + 1);

  return (
    <div className="screen admin-mode-screen">
      <header className="admin-header">
        <div className="header-brand">
          <span className="header-mark header-mark--inv" aria-hidden="true">
            <span />
            <span />
            <span />
            <span className="header-mark-accent" />
          </span>
          <h1>管理画面</h1>
          <span className="admin-badge">ADMIN</span>
        </div>
        <div className="header-spacer" />
        <div className="admin-header-right">
          {remaining && (
            <span className="admin-session-countdown">
              <span className="label admin-session-countdown-label">
                自動ログアウトまで
              </span>
              <span className="mono">{remaining}</span>
            </span>
          )}
          <button type="button" className="btn inv" onClick={exitAdminMode}>
            進行画面に戻る
          </button>
          <button
            type="button"
            className="btn inv"
            onClick={async () => {
              await logout();
              exitAdminMode();
            }}
          >
            ログアウト
          </button>
        </div>
      </header>

      <div className="admin-sections">
        <AdminSection number="01" title="初期化(PAT〜対象プール〜トークン)">
          <InitLogin onInitialized={refreshTablePanel} />
        </AdminSection>
        <AdminSection number="02" title="対象プール">
          <PoolSelection onPoolChanged={refreshTablePanel} />
        </AdminSection>
        <AdminSection number="03" title="同期状況">
          <RefetchDataButton />
        </AdminSection>
        <AdminSection number="04" title="対戦台設定">
          <TableSettingsPanel key={poolRefreshKey} />
        </AdminSection>
        <AdminSection number="05" title="連携トークン">
          <TokenSettings />
        </AdminSection>
        <AdminSection number="06" title="進行ルールの確認">
          <NoticeAdminPanel />
        </AdminSection>
        <AdminSection number="07" title="初期化(危険)" danger>
          <ResetDataButton />
        </AdminSection>
      </div>
    </div>
  );
}

/** US5: 管理画面(認証・初期化・トークン管理・ログアウト・注意書き連携)。 */
export function AdminModeScreen() {
  return (
    <AdminPasswordGate>
      <AdminModeContent />
    </AdminPasswordGate>
  );
}
