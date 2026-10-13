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
      <div className="admin-login-box">
        {autoLogoutNotice && (
          <output className="auto-logout-notice">
            <strong>自動的にログアウトしました。</strong>
            24時間が経過したためです。もう一度ログインしてください。
            <button type="button" onClick={dismissAutoLogoutNotice}>
              閉じる
            </button>
          </output>
        )}
        <div>
          <div className="label">Admin</div>
          <h2 className="admin-login-title">管理画面ログイン</h2>
        </div>
        <p className="note">
          大会運営で共有しているパスワードを入力してください。ログインから
          24時間で自動的にログアウトします。
        </p>
        <div className="admin-login-field">
          <label className="label" htmlFor="admin-password">
            パスワード
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="パスワード"
          />
        </div>
        <button
          type="button"
          className="btn-primary admin-login-submit"
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
    </div>
  );
}
