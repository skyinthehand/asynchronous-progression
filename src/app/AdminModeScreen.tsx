import { useState } from "react";
import { AdminPasswordGate } from "../features/admin/AdminPasswordGate.js";
import { useAdminSession } from "../features/admin/AdminSessionContext.js";
import { InitLogin } from "../features/admin/InitLogin.js";
import { NoticeAdminPanel } from "../features/admin/NoticeAdminPanel.js";
import { PoolSelection } from "../features/admin/PoolSelection.js";
import { TableSettingsPanel } from "../features/admin/TableSettingsPanel.js";
import { TokenSettings } from "../features/admin/TokenSettings.js";
import { runSync } from "../features/sync/syncRunner.js";
import { resetAllData } from "../infra/storage/db.js";
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

/**
 * ユーザー要望(2026-08-19): ログイン状態(adminSession)・start.gg連携設定
 * (startggConfig)を含め、この端末に保存された内容をすべて消去する
 * (`infra/storage/db.ts`の`resetAllData`参照)。破壊的な操作のため、
 * 実行前に確認ダイアログを挟む。消去後はメモリ上の各種状態(ログイン中か
 * どうか・読み込み済みのプール等)も作り直す必要があるため、ページを
 * 再読み込みして最初の画面(注意事項)から始まるようにする。
 */
function ResetDataButton() {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm(
      "ログイン状態・start.gg連携設定・このプールの入力内容を含む、この" +
        "端末に保存されたすべてのデータを削除します。この操作は取り消せ" +
        "ません。よろしいですか？",
    );
    if (!confirmed) return;
    setResetting(true);
    await resetAllData();
    window.location.reload();
  }

  return (
    <section className="reset-data-panel">
      <h3>リセット</h3>
      <p>
        ログイン状態・start.gg連携設定・このプールの入力内容を含む、この
        端末に保存されたすべてのデータを削除します。
      </p>
      <button
        type="button"
        className="btn-danger"
        onClick={handleReset}
        disabled={resetting}
      >
        {resetting ? "削除中…" : "すべてのデータをリセット"}
      </button>
    </section>
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
      <ResetDataButton />
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
