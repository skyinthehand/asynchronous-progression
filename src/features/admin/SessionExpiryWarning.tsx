import { useEffect, useState } from "react";
import { useAdminSession } from "./AdminSessionContext.js";

/** 自動ログアウトの何分前から警告を表示するか。 */
const WARNING_BEFORE_MS = 30 * 60 * 1000;
const TICK_INTERVAL_MS = 15_000;

/**
 * ユーザーフィードバック(2026-10-20): アプリ全体が管理画面ログインで
 * 囲まれているため、ログインから24時間が経過すると、スコア入力等の途中
 * でも予告なくログイン画面に切り替わり、入力途中の内容が失われる。
 * 期限が近づいたら、進行画面・管理画面のどちらでも警告を表示し、区切りの
 * よいところでログインし直してもらう。
 */
export function SessionExpiryWarning() {
  const { expiresAt, logout } = useAdminSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const intervalId = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs > WARNING_BEFORE_MS) return null;
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return (
    <div className="session-expiry-warning no-print" role="alert">
      <p>
        <strong>あと約{remainingMinutes}分で自動的にログアウトします。</strong>
        ログアウトすると、入力途中の内容(保存前のスコア等)は失われます。
        入力の区切りでログインし直してください。
      </p>
      <button type="button" onClick={logout}>
        今すぐログインし直す
      </button>
    </div>
  );
}
