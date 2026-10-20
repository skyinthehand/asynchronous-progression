import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AdminSession } from "../../domain/entities/adminSession.js";
import { saveAdminSession } from "../../infra/storage/adminRepository.js";
import { verifyAdminPassword } from "./adminAuth.js";
import { logoutManually } from "./logout.js";
import {
  checkAndApplyAutoLogout,
  createActiveSession,
  markAutoLogoutNotified,
} from "./sessionExpiry.js";

const RECHECK_INTERVAL_MS = 60_000;

interface AdminSessionContextValue {
  /**
   * 保存済みのセッションを最初に読み込み終えたか。読み込み前に未ログイン
   * 扱いでログイン画面を一瞬表示してしまわないよう、ゲート側で参照する。
   */
  loaded: boolean;
  isActive: boolean;
  autoLogoutNotice: boolean;
  /** デザイン刷新(2026-10-09): ヘッダーの「自動ログアウトまで」表示用。 */
  expiresAt: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  dismissAutoLogoutNotice: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionContextValue | undefined>(
  undefined,
);

/**
 * 管理画面の認証状態をアプリ全体で共有する(複数のコンポーネントから
 * 参照してもズレが生じないよう、単一のセッション状態を1箇所で保持する)。
 * FR-030: 24時間経過での自動ログアウトを定期的に検知する。
 * FR-031: 発生直後/次回起動時のいずれでも通知できるようにする。
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [autoLogoutNotice, setAutoLogoutNotice] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { justAutoLoggedOut, session: current } =
      await checkAndApplyAutoLogout();
    setSession(current ?? null);
    setLoaded(true);
    if (
      (justAutoLoggedOut || current?.status === "LOGGED_OUT_AUTO") &&
      !current?.autoLogoutNotifiedAt
    ) {
      setAutoLogoutNotice(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, RECHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    const ok = await verifyAdminPassword(password);
    if (!ok) return false;
    const newSession = createActiveSession();
    await saveAdminSession(newSession);
    setSession(newSession);
    setAutoLogoutNotice(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await logoutManually();
    await refresh();
  }, [refresh]);

  const dismissAutoLogoutNotice = useCallback(async () => {
    await markAutoLogoutNotified();
    setAutoLogoutNotice(false);
  }, []);

  const value: AdminSessionContextValue = {
    loaded,
    isActive: session?.status === "ACTIVE",
    autoLogoutNotice,
    expiresAt: session?.status === "ACTIVE" ? session.expiresAt : null,
    login,
    logout,
    dismissAutoLogoutNotice,
  };

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionContextValue {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error(
      "useAdminSession must be used within an AdminSessionProvider",
    );
  }
  return context;
}
