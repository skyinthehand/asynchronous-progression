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
    tableNumbers: [],
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
    ...overrides,
  };
}

/** スコアは文字入力させず、DQ/0/1/2/3のボタンから選ぶ。 */
async function selectScore(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  entrantName: string,
  option: "DQ" | "0" | "1" | "2" | "3" | "W",
) {
  const group = within(container).getByRole("group", {
    name: `${entrantName}のスコア`,
  });
  await user.click(within(group).getByRole("button", { name: option }));
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

    await selectScore(user, document.body, "Alice", "3");
    await selectScore(user, document.body, "Bob", "1");
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

    await selectScore(user, document.body, "Alice", "3");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/\(3-0\)/)).toBeInTheDocument();
  });

  it("reflects the auto-filled 0 on screen immediately, without confirming the result (clarification)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await selectScore(user, document.body, "Alice", "3");

    const bobGroup = screen.getByRole("group", { name: "Bobのスコア" });
    expect(within(bobGroup).getByRole("button", { name: "0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 「反映」は画面表示のみで、まだ確定はされていない。
    expect(screen.queryByText(/勝者:/)).not.toBeInTheDocument();

    // 明示的に確定ボタンを押すまでは結果は残らない。
    await selectScore(user, document.body, "Bob", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));
    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/\(3-1\)/)).toBeInTheDocument();
  });

  it("confirms the result as a DQ without requiring a score (Acceptance Scenario 3)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await selectScore(user, document.body, "Bob", "DQ");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
  });

  it("confirms a win via W (winner known, score unknown), auto-filling the opponent with 0", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await selectScore(user, document.body, "Alice", "W");

    const bobGroup = screen.getByRole("group", { name: "Bobのスコア" });
    expect(within(bobGroup).getByRole("button", { name: "0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    expect(screen.getByText(/\(W-0\)/)).toBeInTheDocument();
  });

  it("rejects both entrants being marked W simultaneously", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await selectScore(user, document.body, "Alice", "W");
    await selectScore(user, document.body, "Bob", "W");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(
      await screen.findByText(/両方の出場者を同時に勝者\(W\)にはできません/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/勝者:/)).not.toBeInTheDocument();
  });

  it("rejects a tie and prompts for correction (Acceptance Scenario 4)", async () => {
    await seedPool([baseCard({})]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await selectScore(user, document.body, "Alice", "2");
    await selectScore(user, document.body, "Bob", "2");
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

    await selectScore(user, document.body, "Alice", "DQ");
    await selectScore(user, document.body, "Bob", "DQ");
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
    await selectScore(user, row, "Alice", "1");
    await user.click(within(row).getByRole("button", { name: "結果を確定" }));

    expect(within(row).getByText(/勝者: Alice/)).toBeInTheDocument();
  });
});
