import { type ReactNode, useState } from "react";
import { useAdminSession } from "./AdminSessionContext.js";

interface AdminPasswordGateProps {
  children: ReactNode;
}

/** FR-026: パスワード認証によってのみ管理画面へ入室できる。 */
export function AdminPasswordGate({ children }: AdminPasswordGateProps) {
  const { isActive, autoLogoutNotice, login, dismissAutoLogoutNotice } =
    useAdminSession();
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (isActive) {
    return <>{children}</>;
  }

  return (
    <div className="admin-password-gate">
      {autoLogoutNotice && (
        <div role="alert" className="auto-logout-notice">
          24時間が経過したため自動的にログアウトされました。
          <button type="button" onClick={dismissAutoLogoutNotice}>
            閉じる
          </button>
        </div>
      )}
      <h2>管理画面ログイン</h2>
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="パスワード"
      />
      <button
        type="button"
        onClick={async () => {
          const ok = await login(password);
          setInvalid(!ok);
          if (ok) setPassword("");
        }}
      >
        ログイン
      </button>
      {invalid && <p role="alert">パスワードが正しくありません。</p>}
    </div>
  );
}
