import { AdminSessionProvider } from "../features/admin/AdminSessionContext.js";
import { HelpButton } from "../features/help/HelpButton.js";
import { EmergencyContactWarning } from "../features/notice/EmergencyContactWarning.js";
import { NoticeGate } from "../features/notice/NoticeGate.js";
import { SyncStatusSnackbar } from "../features/sync/SyncStatusSnackbar.js";
import { useSyncScheduler } from "../features/sync/useSyncScheduler.js";
import { AdminModeScreen } from "./AdminModeScreen.js";
import { GeneralModeScreen } from "./GeneralModeScreen.js";
import { RouterProvider, useAppMode } from "./router.js";

function AppContent() {
  const { mode } = useAppMode();
  useSyncScheduler();
  return (
    <div className="app-content">
      {/* ユーザーフィードバック(2026-10-13): 進行ルールは大会(イベント)に
          紐づく情報のため、管理画面ログイン前(未認証・対象未設定の時点)に
          それらしいボタンを出すのは誤解を招く。一般モードのヘッダー
          (GeneralModeScreen.tsx)にのみ導線を置き、管理画面側は
          ダッシュボードの「06 進行ルールの確認」セクション
          (NoticeAdminPanel)で代替する。 */}
      <EmergencyContactWarning />
      {mode === "general" ? <GeneralModeScreen /> : <AdminModeScreen />}
      <SyncStatusSnackbar />
    </div>
  );
}

export function App() {
  return (
    <RouterProvider>
      <AdminSessionProvider>
        {/* NoticeGateは注意事項未確認の間は他の子要素を描画しないため、
            最初の画面でも使い方を確認できるようその外側に配置する。 */}
        <HelpButton />
        <NoticeGate>
          <AppContent />
        </NoticeGate>
      </AdminSessionProvider>
    </RouterProvider>
  );
}
