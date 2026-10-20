import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { AdminSessionProvider } from "../features/admin/AdminSessionContext.js";
import { HelpButton } from "../features/help/HelpButton.js";
import { EmergencyContactWarning } from "../features/notice/EmergencyContactWarning.js";
import { NoticeGate } from "../features/notice/NoticeGate.js";
import { SyncStatusSnackbar } from "../features/sync/SyncStatusSnackbar.js";
import { useSyncScheduler } from "../features/sync/useSyncScheduler.js";
import { AdminModeScreen } from "./AdminModeScreen.js";
import { GeneralModeScreen } from "./GeneralModeScreen.js";
import { RouterProvider, useAppMode } from "./router.js";

/**
 * ログアウト中(ログイン画面の表示中)も、ログアウト前に入力済みで未送信の
 * 結果等をstart.ggへ送れるよう、バックグラウンド同期はログイン状態の
 * ゲート(AdminPasswordGate)の外で常に稼働させる。
 */
function BackgroundSync() {
  useSyncScheduler();
  return null;
}

function AppContent() {
  const { mode } = useAppMode();
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
        <BackgroundSync />
        {/* NoticeGateは注意事項未確認の間は他の子要素を描画しないため、
            最初の画面でも使い方を確認できるようその外側に配置する。 */}
        <HelpButton />
        {/* ユーザーフィードバック(2026-10-20): ログアウト中は、進行ルール
            (対象大会つき)・進行画面を含むアプリ全体の代わりに管理画面
            ログインのみを表示する。ログインし直すと、進行ルールの確認
            (NoticeGate)からやり直しになる。 */}
        <AdminPasswordGate>
          <NoticeGate>
            <AppContent />
          </NoticeGate>
        </AdminPasswordGate>
      </AdminSessionProvider>
    </RouterProvider>
  );
}
