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

function card(overrides: Record<string, unknown>) {
  return {
    id: "card",
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

async function seedPool(tableNumbers: string[]) {
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
    tableNumbers,
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
    ["e4", "Dave"],
    ["e5", "Eve"],
    ["e6", "Frank"],
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
  await db.put(
    "matchCards",
    card({
      id: "card-1",
      identifier: "R1-1",
      tableNumber: "1",
      entrant1Id: "e1",
      entrant2Id: "e2",
    }),
  );
  await db.put(
    "matchCards",
    card({
      id: "card-2",
      identifier: "R1-2",
      entrant1Id: "e3",
      entrant2Id: "e4",
    }),
  );
  await db.put(
    "matchCards",
    card({
      id: "card-3",
      identifier: "R1-3",
      entrant1Id: "e5",
      entrant2Id: "e6",
    }),
  );
}

async function completeCard1(user: ReturnType<typeof userEvent.setup>) {
  const identifier = await screen.findByText("R1-1");
  const row = identifier.closest("tr");
  if (!row) throw new Error("R1-1 row not found");
  const aliceGroup = within(row).getByRole("group", { name: "Aliceのスコア" });
  await user.click(within(aliceGroup).getByRole("button", { name: "1" }));
  await user.click(within(row).getByRole("button", { name: "結果を確定" }));
}

describe("Next-match suggestion modal (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("shows the next-match suggestion for the freed table immediately after confirming a result (FR-017/FR-022)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();
  });

  it("starts the suggested match as IN_PROGRESS without a table number when none is entered (Acceptance Scenario 7)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "対戦開始" }));

    const db = await getDb();
    const suggested = await db.get("matchCards", "card-2");
    expect(suggested?.status).toBe("IN_PROGRESS");
    expect(suggested?.tableNumber).toBeNull();
  });

  it("presents a different candidate for the same table after skipping, without removing the skipped card from the list", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    let modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    let modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "スキップ" }));

    modalHeading = await screen.findByRole("heading", { name: "次戦候補" });
    modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-3")).toBeInTheDocument();

    // スキップされた対戦は一覧から消えない。
    expect(screen.getByText("R1-2")).toBeInTheDocument();
    const db = await getDb();
    const skipped = await db.get("matchCards", "card-2");
    expect(skipped?.skippedFromSuggestion).toBe(true);
    expect(skipped?.status).toBe("NOT_STARTED");
  });

  it("leaves the match unchanged when the modal is closed without a selection (FR-025)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();

    const db = await getDb();
    const card2 = await db.get("matchCards", "card-2");
    expect(card2?.status).toBe("NOT_STARTED");
    expect(card2?.skippedFromSuggestion).toBe(false);
  });

  it("falls back to a single pool-wide suggestion when the pool has no table count set (FR-018)", async () => {
    await seedPool([]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    // tableNumbers未設定なので対戦台選択は表示されない。
    expect(
      within(modal).queryByLabelText("次戦の対戦台"),
    ).not.toBeInTheDocument();
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();
  });

  it("identifies the next-match candidate on the bracket board without opening the modal (FR-026)", async () => {
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
    await db.put(
      "matchCards",
      card({
        id: "card-1",
        identifier: "WF",
        entrant1Id: "e1",
        entrant2Id: "e2",
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const identifier = await screen.findByText("WF");
    const bracketCard = identifier.closest("li");
    expect(bracketCard).not.toBeNull();
    expect(bracketCard?.className).toContain("match-card-next");
    // モーダルは結果確定直後にのみ表示され、単に画面を開いただけでは出ない。
    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();
  });
});
