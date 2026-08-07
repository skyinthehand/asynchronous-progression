import type { AdminSession } from "../../domain/entities/adminSession.js";
import {
  getAdminSession,
  saveAdminSession,
} from "../../infra/storage/adminRepository.js";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function createActiveSession(now: Date = new Date()): AdminSession {
  return {
    loggedInAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
    status: "ACTIVE",
    autoLogoutNotifiedAt: null,
  };
}

/**
 * FR-030: 管理画面へのログインから24時間が経過した時点で自動的に
 * ログアウトさせる。呼び出し時点で期限切れなら状態遷移させ、直後に
 * FR-031の通知対象であることを呼び出し元へ伝える。
 */
export async function checkAndApplyAutoLogout(
  now: Date = new Date(),
): Promise<{ justAutoLoggedOut: boolean; session: AdminSession | undefined }> {
  const session = await getAdminSession();
  if (!session || session.status !== "ACTIVE") {
    return { justAutoLoggedOut: false, session };
  }
  if (new Date(session.expiresAt).getTime() > now.getTime()) {
    return { justAutoLoggedOut: false, session };
  }
  const updated: AdminSession = {
    ...session,
    status: "LOGGED_OUT_AUTO",
    autoLogoutNotifiedAt: null,
  };
  await saveAdminSession(updated);
  return { justAutoLoggedOut: true, session: updated };
}

/** FR-031: 自動ログアウトの通知を行った(表示した)ことを記録する。 */
export async function markAutoLogoutNotified(): Promise<void> {
  const session = await getAdminSession();
  if (session?.status === "LOGGED_OUT_AUTO" && !session.autoLogoutNotifiedAt) {
    await saveAdminSession({
      ...session,
      autoLogoutNotifiedAt: new Date().toISOString(),
    });
  }
}
