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

async function seedPoolWithTwoRounds() {
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
    bracketType: "SINGLE_ELIMINATION",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "PRESENT",
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
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: "e1",
    score: null,
    status: "COMPLETED",
    isLocked: false,
    editHistory: [],
    localOnly: true,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
  });
  await db.put("matchCards", {
    id: "card-2",
    poolId: "pool-1",
    identifier: "R2-1",
    round: 2,
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e3",
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: "card-1",
    entrant2SourceMatchId: null,
  });
}

describe("Match result correction (User Story 6)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPoolWithTwoRounds();
  });

  it("allows correcting a result while the downstream match has not started", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    await screen.findByText("R1-1");
    await user.click(screen.getByRole("button", { name: "結果を修正" }));
    await user.click(screen.getByRole("button", { name: "Bob の勝ち" }));

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.winnerId).toBe("e2");
  });

  it("rejects correction once the downstream match has progressed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    // 後続(R2)の結果を先に入力し、R1をロック状態にする。
    const r2 = (await screen.findByText("R2-1")).closest("li");
    if (!r2) throw new Error("round 2 card not found");
    await user.click(within(r2).getByRole("button", { name: "Alice の勝ち" }));

    const r1 = (await screen.findByText("R1-1")).closest("li");
    if (!r1) throw new Error("round 1 card not found");
    expect(
      within(r1).queryByRole("button", { name: "結果を修正" }),
    ).not.toBeInTheDocument();
    expect(
      within(r1).getByText(/後続の対戦が進行しているため/),
    ).toBeInTheDocument();
  });
});
