import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { useAdminSession } from "../features/admin/AdminSessionContext.js";
import { InitLogin } from "../features/admin/InitLogin.js";
import { NoticeAdminPanel } from "../features/admin/NoticeAdminPanel.js";
import { PoolSelection } from "../features/admin/PoolSelection.js";
import { TokenSettings } from "../features/admin/TokenSettings.js";
import { useAppMode } from "./router.js";

function AdminModeContent() {
  const { exitAdminMode } = useAppMode();
  const { logout } = useAdminSession();

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
      <InitLogin onInitialized={() => {}} />
      <PoolSelection />
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
