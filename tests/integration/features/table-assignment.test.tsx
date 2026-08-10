import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchTournamentRules: vi.fn().mockRejectedValue(new Error("offline")),
}));

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/注意事項をまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function seedPool(tableCount: number | null) {
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
    onboardingCompletedAt: new Date().toISOString(),
    tableCount,
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
    ["e4", "Dave"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "UNKNOWN",
      attendanceRecordedAt: null,
      poolFinished: false,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put("matchCards", {
    id: "card-1",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "N/A",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    skippedFromSuggestion: false,
  });
  await db.put("matchCards", {
    id: "card-2",
    poolId: "pool-1",
    identifier: "R1-2",
    round: 1,
    bracketSide: "N/A",
    tableNumber: null,
    entrant1Id: "e3",
    entrant2Id: "e4",
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    skippedFromSuggestion: false,
  });
}

async function openTablesModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "対戦台数" }));
  const heading = await screen.findByRole("heading", { name: "対戦台数" });
  const modal = heading.closest(".app-modal");
  if (!modal) throw new Error("tables modal not found");
  return modal as HTMLElement;
}

describe("Table count setting and assignment (User Story 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("allows setting the pool's table count and assigning a table number to a card", async () => {
    await seedPool(null);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const modal = await openTablesModal(user);
    const input = within(modal).getByLabelText("対戦台数");
    await user.type(input, "3");
    await user.click(
      within(modal).getByRole("button", { name: "対戦台数を設定" }),
    );
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    const select = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select, "2");

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.tableNumber).toBe("2");
  });

  it("rejects assigning a table already occupied by another incomplete card (FR-014)", async () => {
    await seedPool(3);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select1 = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select1, "2");

    const select2 = screen.getByLabelText("R1-2の対戦台");
    await user.selectOptions(select2, "2");

    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    const card2 = await db.get("matchCards", "card-2");
    expect(card1?.tableNumber).toBe("2");
    // 占有中の対戦台への割り当ては拒否され、card-2の対戦台番号は変わらない。
    expect(card2?.tableNumber).toBeNull();
  });

  it("keeps a locally-assigned table number after a sync merges remote data (FR-016)", async () => {
    await seedPool(3);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select, "1");

    const { mergeMatchCard } = await import(
      "../../../src/features/sync/syncRunner.js"
    );
    const db = await getDb();
    const local = await db.get("matchCards", "card-1");
    const remote = { ...local, tableNumber: null, localOnly: false };
    const merged = mergeMatchCard(local, remote);
    expect(merged.tableNumber).toBe("1");
  });
});
