import { AdminSessionProvider } from "../features/admin/AdminSessionContext.js";
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
      <div className="app-toolbar no-print">
        <NoticeViewer />
      </div>
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
        <NoticeGate>
          <AppContent />
        </NoticeGate>
      </AdminSessionProvider>
    </RouterProvider>
  );
}
