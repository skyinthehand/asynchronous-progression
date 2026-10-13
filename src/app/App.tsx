import { AdminSessionProvider } from "../features/admin/AdminSessionContext.js";
import { HelpButton } from "../features/help/HelpButton.js";
import { EmergencyContactWarning } from "../features/notice/EmergencyContactWarning.js";
import { NoticeGate } from "../features/notice/NoticeGate.js";
import { NoticeViewer } from "../features/notice/NoticeViewer.js";
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
      {/* デザイン刷新(2026-10-09): 一般モードの「注意書き」導線は
          GeneralModeScreen.tsxのヘッダーに移設した。管理画面(Phase 8で
          独自ヘッダーに統合予定)はひとまずここに残す。 */}
      {mode === "admin" && (
        <div className="app-toolbar no-print">
          <NoticeViewer />
        </div>
      )}
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
