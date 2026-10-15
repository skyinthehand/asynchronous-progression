import { useState } from "react";
import { resetAllData } from "../../infra/storage/db.js";

/**
 * ユーザー要望(2026-08-19): ログイン状態(adminSession)・start.gg連携設定
 * (startggConfig)を含め、この端末に保存された内容をすべて消去する
 * (`infra/storage/db.ts`の`resetAllData`参照)。破壊的な操作のため、
 * 実行前に確認ダイアログを挟む。消去後はメモリ上の各種状態(ログイン中か
 * どうか・読み込み済みのプール等)も作り直す必要があるため、ページを
 * 再読み込みして最初の画面(注意事項)から始まるようにする。
 *
 * ユーザー要望(2026-10-15): パスワードを忘れると管理画面に一切入れず
 * どうしようもなくなるため、ログイン画面(AdminPasswordGate.tsx)にも
 * この同じボタンを置けるよう独立したコンポーネントとして切り出す
 * (管理画面ダッシュボード側のAdminModeScreen.tsxと共通利用)。
 */
export function ResetDataButton() {
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
    <div className="reset-data-panel">
      <p className="note">
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
    </div>
  );
}
