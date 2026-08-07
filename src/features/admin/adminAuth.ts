import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * FR-026: パスワード認証によってのみ管理画面へ入室できる。
 * spec.md Assumptionsの「運営内で共有される単一の認証情報」に基づき、
 * 初回入力時にそのパスワードをそのまま初期パスワードとして登録する
 * (bootstrap)。以降は同じパスワードでのみ入室できる。
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const config = await getStartggConfig();
  const hash = await sha256Hex(password);

  if (!config?.adminPasswordHash) {
    await saveStartggConfig({
      tournamentSlug: config?.tournamentSlug ?? null,
      eventId: config?.eventId ?? null,
      phaseId: config?.phaseId ?? null,
      poolId: config?.poolId ?? null,
      syncToken: config?.syncToken ?? null,
      tokenUpdatedAt: config?.tokenUpdatedAt ?? null,
      adminPasswordHash: hash,
    });
    return true;
  }

  return hash === config.adminPasswordHash;
}
