import { type ReactNode, useState } from "react";
import { useAdminSession } from "./AdminSessionContext.js";
import { ResetDataButton } from "./ResetDataButton.js";

interface AdminPasswordGateProps {
  children: ReactNode;
}

/**
 * FR-026: パスワード認証によってのみ管理画面へ入室できる。
 * ユーザーフィードバック(2026-10-20): ログアウト中(手動・自動・未ログイン)
 * に起動時の進行ルール(対象大会つき)や進行画面が表示されるのはおかしい
 * ため、管理画面だけでなくアプリ全体(App.tsx)をこのゲートで囲み、
 * ログアウト中はログイン画面のみを表示する。
 */
export function AdminPasswordGate({ children }: AdminPasswordGateProps) {
  const { loaded, isActive, autoLogoutNotice, login, dismissAutoLogoutNotice } =
    useAdminSession();
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (!loaded) {
    return null;
  }

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
      {/* ユーザー要望(2026-10-15): パスワードを忘れると管理画面に一切
          入れずどうしようもなくなるため、ログイン画面にも初期化(全データ
          削除)の手段を用意する。削除後は次に入力したパスワードが新しい
          パスワードとしてブートストラップされる(adminAuth.ts参照)。 */}
      <div className="admin-login-box admin-login-forgot">
        <p className="label">パスワードを忘れた場合</p>
        <ResetDataButton />
      </div>
    </div>
  );
}
