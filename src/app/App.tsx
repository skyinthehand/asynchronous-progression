import { HelpButton } from "../features/help/HelpButton.js";
import { EmergencyContactWarning } from "../features/notice/EmergencyContactWarning.js";
import { NoticeGate } from "../features/notice/NoticeGate.js";
import { SyncStatusSnackbar } from "../features/sync/SyncStatusSnackbar.js";
import { useSyncScheduler } from "../features/sync/useSyncScheduler.js";
import { AdminModeScreen } from "./AdminModeScreen.js";
import { BetaBanner } from "./BetaBanner.js";
import { GeneralModeScreen } from "./GeneralModeScreen.js";
import { RouterProvider, useAppMode } from "./router.js";

/**
 * バックグラウンド同期は、進行ルールの確認(NoticeGate)の前から常に
 * 稼働させる(確認前でも未送信の結果等をstart.ggへ送れるようにするため)。
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
          紐づく情報のため、対象未設定の時点で
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
      <BackgroundSync />
      {/* ユーザーフィードバック(2026-11-09): 開発版の一時公開中はβ版で
          あることを全画面で示す。正式版にするときに外す(BetaBanner.tsx参照)。 */}
      <BetaBanner />
      {/* NoticeGateは注意事項未確認の間は他の子要素を描画しないため、
          最初の画面でも使い方を確認できるようその外側に配置する。 */}
      <HelpButton />
      {/* ユーザーフィードバック(2026-11-09): 管理画面のパスワードによる
          ログイン・ログアウトは、操作をややこしくするだけのため廃止した
          (紙の進行用紙も誰でも書き換えられる運用で問題がなかった)。 */}
      <NoticeGate>
        <AppContent />
      </NoticeGate>
    </RouterProvider>
  );
}
