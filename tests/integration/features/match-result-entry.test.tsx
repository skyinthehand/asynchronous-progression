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

async function seedPool(matchCards: Record<string, unknown>[]) {
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
    tableCount: null,
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
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
  for (const card of matchCards) {
    await db.put("matchCards", card);
  }
}

function baseCard(overrides: Record<string, unknown>) {
  return {
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
    ...overrides,
  };
}

async function enterScore(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) {
    await user.type(input, value);
  }
}

describe("Score/DQ based result entry (User Story 1)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("declares the higher score the winner (Acceptance Scenario 1)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await enterScore(user, "Aliceのスコア", "3");
    await enterScore(user, "Bobのスコア", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/\(3-1\)/)).toBeInTheDocument();
  });

  it("auto-fills the unfilled side with 0 (Acceptance Scenario 2)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await enterScore(user, "Aliceのスコア", "3");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/\(3-0\)/)).toBeInTheDocument();
  });

  it("confirms the result as a DQ without requiring a score (Acceptance Scenario 3)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    // Bob側(2つ目)のDQチェックボックスのみをオンにする。
    const dqCheckboxes = screen.getAllByRole("checkbox");
    await user.click(dqCheckboxes[1]);

    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
  });

  it("rejects a tie and prompts for correction (Acceptance Scenario 4)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await enterScore(user, "Aliceのスコア", "2");
    await enterScore(user, "Bobのスコア", "2");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(
      await screen.findByText(/同点のため結果を確定できません/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/勝者:/)).not.toBeInTheDocument();
  });

  it("rejects both entrants being DQ'd simultaneously (Acceptance Scenario 5)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const dqCheckboxes = screen.getAllByRole("checkbox");
    await user.click(dqCheckboxes[0]);
    await user.click(dqCheckboxes[1]);
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(
      await screen.findByText(/両方の出場者を同時に失格にはできません/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/勝者:/)).not.toBeInTheDocument();
  });
});

describe('"In Progress" status is optional (User Story 4)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool([
      baseCard({ id: "card-1", identifier: "R1-1" }),
      baseCard({
        id: "card-2",
        identifier: "R1-2",
        entrant1Id: "e1",
        entrant2Id: "e2",
      }),
    ]);
  });

  it("distinguishes a card set to in-progress from other not-started cards (Acceptance Scenario 1)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const identifier = await screen.findByText("R1-1");
    const row = identifier.closest("tr");
    if (!row) throw new Error("R1-1 row not found");
    await user.click(within(row).getByRole("button", { name: "進行中にする" }));

    expect(within(row).getByText("進行中")).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: "進行中にする" }),
    ).not.toBeInTheDocument();
  });

  it("still allows confirming a result directly, without going through in-progress (Acceptance Scenario 2)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const identifier = await screen.findByText("R1-2");
    const row = identifier.closest("tr");
    if (!row) throw new Error("R1-2 row not found");
    const aliceScore = within(row).getByLabelText("Aliceのスコア");
    await user.clear(aliceScore);
    await user.type(aliceScore, "1");
    await user.click(within(row).getByRole("button", { name: "結果を確定" }));

    expect(within(row).getByText(/勝者: Alice/)).toBeInTheDocument();
  });
});
