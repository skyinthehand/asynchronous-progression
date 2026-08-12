import { useState } from "react";
import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { useAdminSession } from "../features/admin/AdminSessionContext.js";
import { InitLogin } from "../features/admin/InitLogin.js";
import { NoticeAdminPanel } from "../features/admin/NoticeAdminPanel.js";
import { PoolSelection } from "../features/admin/PoolSelection.js";
import { TableSettingsPanel } from "../features/admin/TableSettingsPanel.js";
import { TokenSettings } from "../features/admin/TokenSettings.js";
import { useAppMode } from "./router.js";

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
