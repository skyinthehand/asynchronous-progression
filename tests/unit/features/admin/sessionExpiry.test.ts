import { beforeEach, describe, expect, it } from "vitest";
import {
  checkAndApplyAutoLogout,
  createActiveSession,
  markAutoLogoutNotified,
} from "../../../../src/features/admin/sessionExpiry.js";
import {
  getAdminSession,
  saveAdminSession,
} from "../../../../src/infra/storage/adminRepository.js";
import { getDb } from "../../../../src/infra/storage/db.js";

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

describe("Admin session 24h auto-logout (FR-030/FR-031)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("does not auto-logout an active session within 24 hours", async () => {
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");
    await saveAdminSession(createActiveSession(loggedInAt));

    const now = new Date("2026-01-01T23:59:00.000Z");
    const { justAutoLoggedOut } = await checkAndApplyAutoLogout(now);

    expect(justAutoLoggedOut).toBe(false);
    expect((await getAdminSession())?.status).toBe("ACTIVE");
  });

  it("auto-logs out once 24 hours have elapsed", async () => {
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");
    await saveAdminSession(createActiveSession(loggedInAt));

    const now = new Date("2026-01-02T00:00:01.000Z");
    const { justAutoLoggedOut } = await checkAndApplyAutoLogout(now);

    expect(justAutoLoggedOut).toBe(true);
    const session = await getAdminSession();
    expect(session?.status).toBe("LOGGED_OUT_AUTO");
    expect(session?.autoLogoutNotifiedAt).toBeNull();
  });

  it("is a no-op when there is no session or it is already logged out", async () => {
    const result = await checkAndApplyAutoLogout();
    expect(result.justAutoLoggedOut).toBe(false);
  });

  it("marks the auto-logout as notified exactly once", async () => {
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");
    await saveAdminSession(createActiveSession(loggedInAt));
    await checkAndApplyAutoLogout(new Date("2026-01-02T00:00:01.000Z"));

    await markAutoLogoutNotified();
    const session = await getAdminSession();
    expect(session?.autoLogoutNotifiedAt).not.toBeNull();
  });
});
