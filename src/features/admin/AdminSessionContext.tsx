import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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
  // ログイン・ログアウトのたびに進める世代番号。定期確認(refresh)が
  // 読み込みを始めた後にログイン等が行われた場合、その古い読み込み結果で
  // 新しいセッションを上書きしないようにするため(ログイン直後に、直前に
  // 始まっていた定期確認の「ログアウト中」の結果でログイン画面へ戻されて
  // しまう)。
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = generationRef.current;
    try {
      const { justAutoLoggedOut, session: current } =
        await checkAndApplyAutoLogout();
      if (generation !== generationRef.current) return;
      setSession(current ?? null);
      if (
        (justAutoLoggedOut || current?.status === "LOGGED_OUT_AUTO") &&
        !current?.autoLogoutNotifiedAt
      ) {
        setAutoLogoutNotice(true);
      }
    } catch {
      // IndexedDBの読み込みに失敗した場合は未ログインとして扱う(ここで
      // loadedを立てないと、アプリ全体がゲートの手前で何も描画されない
      // まま、ログイン画面・初期化ボタンにもたどり着けなくなる)。
      if (generation !== generationRef.current) return;
      setSession(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, RECHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refresh]);

  // 定期確認(最大60秒間隔)を待たず、期限ちょうどに自動ログアウトさせる。
  const expiresAt = session?.status === "ACTIVE" ? session.expiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    // setTimeoutの上限(約24.8日)を超える値は即時実行されてしまうため、
    // その場合は定期確認に任せる(通常は24時間以内)。
    if (delay > MAX_TIMEOUT_MS) return;
    const timeoutId = setTimeout(refresh, delay);
    return () => clearTimeout(timeoutId);
  }, [expiresAt, refresh]);

  const login = useCallback(async (password: string) => {
    const ok = await verifyAdminPassword(password);
    if (!ok) return false;
    const newSession = createActiveSession();
    generationRef.current += 1;
    await saveAdminSession(newSession);
    setSession(newSession);
    setAutoLogoutNotice(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    generationRef.current += 1;
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
    expiresAt,
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
