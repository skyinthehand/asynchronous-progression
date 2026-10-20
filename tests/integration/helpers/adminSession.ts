import { createActiveSession } from "../../../src/features/admin/sessionExpiry.js";
import { saveAdminSession } from "../../../src/infra/storage/adminRepository.js";

/**
 * アプリ全体が管理画面ログイン(AdminPasswordGate)で囲まれているため、
 * ログイン画面以外を検証する結合テストは、描画前にログイン済みの
 * セッションを用意する。
 */
export async function seedActiveAdminSession(): Promise<void> {
  await saveAdminSession(createActiveSession());
}
