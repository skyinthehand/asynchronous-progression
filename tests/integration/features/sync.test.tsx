import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusSnackbar } from "../../../src/features/sync/SyncStatusSnackbar.js";
import { runSync } from "../../../src/features/sync/syncRunner.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchTournamentRules: vi.fn().mockResolvedValue(""),
  fetchPoolDetail: vi.fn(),
  reportMatchResult: vi.fn(),
}));

const operations = await import("../../../src/infra/startgg/operations.js");

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

async function seedConfigAndPool() {
  const db = await getDb();
  await db.put(
    "startggConfig",
    {
      tournamentSlug: "impact-major-4",
      eventId: "1",
      phaseId: "1",
      poolId: "pool-1",
      syncToken: "test-token",
      tokenUpdatedAt: null,
    },
    SINGLETON_KEY,
  );
  await db.put("pools", {
    id: "pool-1",
    displayIdentifier: "Pool 1",
    tournamentSlug: "impact-major-4",
    eventId: "1",
    phaseId: "1",
    className: null,
    bracketType: "ROUND_ROBIN",
    staffName: null,
    lastSyncedAt: null,
  });
  await db.put("matchCards", {
    id: "card-1",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "N/A",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: "e1",
    score: null,
    status: "COMPLETED",
    isLocked: false,
    editHistory: [],
    localOnly: true,
  });
}

describe("Background sync and offline notification (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedConfigAndPool();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.reportMatchResult).mockReset();
  });

  it("marks pending results as reflected after a successful sync", async () => {
    vi.mocked(operations.reportMatchResult).mockResolvedValue({
      winnerId: "e1",
      score: null,
      status: "COMPLETED",
    });
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    await runSync();

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.localOnly).toBe(false);
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastSuccessAt).not.toBeNull();
    expect(status?.isStale).toBe(false);
  });

  it("records a failure without losing local data when startgg is unreachable", async () => {
    vi.mocked(operations.reportMatchResult).mockRejectedValue(
      new Error("network error"),
    );

    await runSync();

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.localOnly).toBe(true); // ローカルデータは失われない
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastFailureReason).toBe("network error");
  });

  it("shows a snackbar when SyncStatus is stale and hides it once resolved", async () => {
    const db = await getDb();
    await db.put("syncStatus", {
      poolId: "pool-1",
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastFailureReason: "network error",
      pendingChangeCount: 1,
      isStale: true,
    });

    render(<SyncStatusSnackbar />);
    expect(
      await screen.findByText(/同期がしばらく成功していません/),
    ).toBeInTheDocument();

    await db.put("syncStatus", {
      poolId: "pool-1",
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: null,
      lastFailureReason: null,
      pendingChangeCount: 0,
      isStale: false,
    });

    await waitFor(
      () =>
        expect(
          screen.queryByText(/同期がしばらく成功していません/),
        ).not.toBeInTheDocument(),
      { timeout: 6000 },
    );
  }, 10000);
});
