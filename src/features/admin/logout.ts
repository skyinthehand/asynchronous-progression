import {
  getAdminSession,
  saveAdminSession,
} from "../../infra/storage/adminRepository.js";

/** FR-029: 管理者が手動でログアウトできる。 */
export async function logoutManually(): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  await saveAdminSession({ ...session, status: "LOGGED_OUT_MANUAL" });
}
