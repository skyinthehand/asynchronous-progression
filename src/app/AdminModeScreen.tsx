import { useState } from "react";
import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { useAdminSession } from "../features/admin/AdminSessionContext.js";
import { InitLogin } from "../features/admin/InitLogin.js";
import { NoticeAdminPanel } from "../features/admin/NoticeAdminPanel.js";
import { PoolSelection } from "../features/admin/PoolSelection.js";
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
      <button type="button" onClick={handleRefetch} disabled={refetching}>
        {refetching ? "再取得中…" : "データを再取得"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}

function AdminModeContent() {
  const { exitAdminMode } = useAppMode();
  const { logout } = useAdminSession();
  // TableSettingsPanelはマウント時に一度だけ対象プールを読み込むため、
  // InitLogin/PoolSelectionで対象プールが変わったらkeyを変えて
  // 強制的に再マウント(再読み込み)させる。これがないと、対戦台設定が
  // 一般モードへ一度戻るまで反映されない不具合になる。
  const [poolRefreshKey, setPoolRefreshKey] = useState(0);
  const refreshTablePanel = () => setPoolRefreshKey((key) => key + 1);

  return (
    <div className="screen admin-mode-screen">
      <header className="screen-header">
        <h1>管理画面</h1>
        <button
          type="button"
          onClick={async () => {
            await logout();
            exitAdminMode();
          }}
        >
          ログアウト
        </button>
        <button type="button" onClick={exitAdminMode}>
          一般モードへ戻る
        </button>
      </header>
      <InitLogin onInitialized={refreshTablePanel} />
      <PoolSelection onPoolChanged={refreshTablePanel} />
      <RefetchDataButton />
      <TableSettingsPanel key={poolRefreshKey} />
      <TokenSettings />
      <NoticeAdminPanel />
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
