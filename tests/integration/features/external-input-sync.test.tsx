import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import type { Entrant } from "../../../src/domain/entities/entrant.js";
import type { MatchCard } from "../../../src/domain/entities/matchCard.js";
import { runSync } from "../../../src/features/sync/syncRunner.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";
import { seedActiveAdminSession } from "../helpers/adminSession.js";

/**
 * ユーザーフィードバック(2026-10-20、スマパでの報告): 結果・状態は
 * アプリからだけでなく、start.gg側(TOの画面・選手の自己報告等)からも
 * 入力される。start.gg側で先に状態が進んだ場合でも、アプリのローカル
 * データがstart.ggに追従することを確認する。
 */

vi.mock("../../../src/infra/startgg/operations.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/infra/startgg/operations.js")
    >();
  return {
    ...actual,
    fetchEventRules: vi.fn().mockResolvedValue(""),
    fetchPoolDetail: vi.fn(),
    reportMatchResult: vi.fn(),
    markSetInProgress: vi.fn().mockResolvedValue(undefined),
    assignStationToSet: vi.fn().mockResolvedValue(undefined),
    fetchStations: vi.fn().mockResolvedValue([]),
    fetchNextMatch: vi.fn(),
  };
});

const operations = await import("../../../src/infra/startgg/operations.js");

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

function makeCard(overrides: Partial<MatchCard> & { id: string }): MatchCard {
  return {
    poolId: "pool-1",
    identifier: "A",
    round: 1,
    bracketSide: "WINNERS",
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
    entrant1W: false,
    entrant2W: false,
    statusLocalOnly: false,
    tableLocalOnly: false,
    isStreamed: false,
    discardedLocalResult: null,
    ...overrides,
  };
}

function makeEntrant(id: string, name: string): Entrant {
  return {
    id,
    poolId: "pool-1",
    name,
    attendance: "PRESENT",
    attendanceRecordedAt: null,
    poolFinished: false,
    seed: null,
    nextMatch: null,
    awayPeriods: [],
  };
}

const ENTRANTS = [makeEntrant("e1", "Alice"), makeEntrant("e2", "Bob")];

async function seed(cards: MatchCard[], entrants: Entrant[] = ENTRANTS) {
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
    bracketType: "DOUBLE_ELIMINATION",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
    tableNumbers: ["1"],
  });
  for (const entrant of entrants) {
    await db.put("entrants", entrant);
  }
  for (const card of cards) {
    await db.put("matchCards", card);
  }
}

function remoteDetail(cards: MatchCard[], entrants: Entrant[] = ENTRANTS) {
  return {
    poolId: "pool-1",
    displayIdentifier: "Pool 1",
    bracketType: "DOUBLE_ELIMINATION" as const,
    matchCards: cards,
    entrants,
  };
}

describe("Sync with results/status entered outside the app (start.gg)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedActiveAdminSession();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.reportMatchResult).mockReset();
    vi.mocked(operations.markSetInProgress)
      .mockReset()
      .mockResolvedValue(undefined);
    vi.mocked(operations.fetchNextMatch).mockReset().mockResolvedValue({
      opponentName: null,
      tableNumber: null,
      confirmed: false,
    });
  });

  it("switches a card stuck in local IN_PROGRESS to COMPLETED once the result is entered on start.gg (reported bug at Smash Party: LR1/LR2 never left 進行中)", async () => {
    await seed([
      makeCard({ id: "s1", status: "IN_PROGRESS", statusLocalOnly: true }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([
        makeCard({ id: "s1", status: "COMPLETED", winnerId: "e1" }),
      ]),
    );

    const result = await runSync();

    expect(result.success).toBe(true);
    // 完了済みのセットへmarkSetInProgressを送らない。
    expect(operations.markSetInProgress).not.toHaveBeenCalled();
    const db = await getDb();
    const card = await db.get("matchCards", "s1");
    expect(card?.status).toBe("COMPLETED");
    expect(card?.winnerId).toBe("e1");
    expect(card?.statusLocalOnly).toBe(false);
    expect((await db.get("syncStatus", "pool-1"))?.pendingChangeCount).toBe(0);
  });

  it("stops retrying markSetInProgress once the set was already started on start.gg", async () => {
    await seed([
      makeCard({ id: "s1", status: "IN_PROGRESS", statusLocalOnly: true }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([makeCard({ id: "s1", status: "IN_PROGRESS" })]),
    );
    vi.mocked(operations.markSetInProgress).mockRejectedValue(
      new Error("Set is already started"),
    );

    const result = await runSync();

    expect(result.success).toBe(true);
    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.status).toBe("IN_PROGRESS");
    expect(card?.statusLocalOnly).toBe(false);
  });

  it("discards an unsent local result when start.gg already has a different result, and records it for the notice modal", async () => {
    await seed([
      makeCard({
        id: "s1",
        status: "COMPLETED",
        winnerId: "e1",
        score: "2-1",
        entrant1Score: 2,
        entrant2Score: 1,
        localOnly: true,
      }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([
        makeCard({ id: "s1", status: "COMPLETED", winnerId: "e2" }),
      ]),
    );

    const result = await runSync();

    expect(result.success).toBe(true);
    // start.gg側の結果をアプリの結果で上書きしない。
    expect(operations.reportMatchResult).not.toHaveBeenCalled();
    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.winnerId).toBe("e2");
    expect(card?.localOnly).toBe(false);
    // 破棄した結果のスコアを新しい勝者と組み合わせて表示しない。
    expect(card?.entrant1Score).toBeNull();
    expect(card?.entrant2Score).toBeNull();
    expect(card?.discardedLocalResult?.winnerId).toBe("e1");
    expect(card?.discardedLocalResult?.score).toBe("2-1");
  });

  it("does not record a discarded result when start.gg has the same winner (keeps local scores)", async () => {
    await seed([
      makeCard({
        id: "s1",
        status: "COMPLETED",
        winnerId: "e1",
        entrant1Score: 2,
        entrant2Score: 0,
        localOnly: true,
      }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([
        makeCard({ id: "s1", status: "COMPLETED", winnerId: "e1" }),
      ]),
    );

    await runSync();

    expect(operations.reportMatchResult).not.toHaveBeenCalled();
    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.localOnly).toBe(false);
    expect(card?.discardedLocalResult).toBeNull();
    expect(card?.entrant1Score).toBe(2);
  });

  it("clears local scores when the winner is changed or reset on start.gg", async () => {
    await seed([
      makeCard({
        id: "s1",
        status: "COMPLETED",
        winnerId: "e1",
        entrant1Score: 2,
        entrant2Score: 1,
      }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([makeCard({ id: "s1" })]),
    );

    await runSync();

    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.status).toBe("NOT_STARTED");
    expect(card?.winnerId).toBeNull();
    expect(card?.entrant1Score).toBeNull();
    expect(card?.entrant2Score).toBeNull();
  });

  it("shows the per-slot score of a result entered on start.gg (reported: 'Player44 2-1 Player53' showed only W)", async () => {
    await seed([makeCard({ id: "s1" })]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([
        makeCard({
          id: "s1",
          status: "COMPLETED",
          winnerId: "e1",
          entrant1Score: 2,
          entrant2Score: 1,
        }),
      ]),
    );

    await runSync();

    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.entrant1Score).toBe(2);
    expect(card?.entrant2Score).toBe(1);
  });

  it("adopts a score corrected on start.gg even when the winner is unchanged", async () => {
    await seed([
      makeCard({
        id: "s1",
        status: "COMPLETED",
        winnerId: "e1",
        entrant1Score: 2,
        entrant2Score: 0,
      }),
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([
        makeCard({
          id: "s1",
          status: "COMPLETED",
          winnerId: "e1",
          entrant1Score: 2,
          entrant2Score: 1,
        }),
      ]),
    );

    await runSync();

    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.entrant2Score).toBe(1);
  });

  it("locks and unlocks a completed card as its successor progresses or is reset on start.gg", async () => {
    const completed = makeCard({
      id: "s1",
      status: "COMPLETED",
      winnerId: "e1",
    });
    const successor = makeCard({
      id: "s2",
      identifier: "B",
      round: 2,
      entrant2Id: null,
    });
    await seed([completed, successor]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([completed, { ...successor, status: "IN_PROGRESS" }]),
    );

    await runSync();
    const db = await getDb();
    expect((await db.get("matchCards", "s1"))?.isLocked).toBe(true);

    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([completed, successor]),
    );
    await runSync();
    expect((await db.get("matchCards", "s1"))?.isLocked).toBe(false);
  });

  it("keeps refetching the next match until the opponent is decided on start.gg", async () => {
    const finished = makeCard({
      id: "s1",
      status: "COMPLETED",
      winnerId: "e1",
    });
    await seed(
      [finished],
      [
        {
          ...makeEntrant("e1", "Alice"),
          poolFinished: true,
          nextMatch: { opponentName: null, tableNumber: null, confirmed: true },
        },
        makeEntrant("e2", "Bob"),
      ],
    );
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([finished]),
    );
    vi.mocked(operations.fetchNextMatch).mockResolvedValue({
      opponentName: "Carol",
      tableNumber: null,
      confirmed: true,
    });

    await runSync();

    const entrant = await (await getDb()).get("entrants", "e1");
    expect(entrant?.nextMatch?.opponentName).toBe("Carol");
  });

  it("removes entrants that were removed from the pool on start.gg", async () => {
    await seed([], [...ENTRANTS, makeEntrant("e3", "Dave")]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue(
      remoteDetail([makeCard({ id: "s1" })]),
    );

    await runSync();

    expect(await (await getDb()).get("entrants", "e3")).toBeUndefined();
  });

  it("shows a modal for a discarded local result until it is acknowledged", async () => {
    // 同期は走らせない(fetchPoolDetailが失敗する)状態で、既に破棄が記録
    // されているカードを持つプール進行画面を開く。
    vi.mocked(operations.fetchPoolDetail).mockRejectedValue(
      new Error("offline"),
    );
    await seed([
      makeCard({
        id: "s1",
        status: "COMPLETED",
        winnerId: "e2",
        discardedLocalResult: {
          winnerId: "e1",
          score: "2-1",
          discardedAt: new Date().toISOString(),
        },
      }),
    ]);
    vi.mocked(operations.fetchEventRules).mockRejectedValue(
      new Error("offline"),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/進行ルールをまだ取得できていません/);
    await user.click(
      screen.getByRole("button", { name: "内容を確認しました" }),
    );

    await screen.findByText("アプリで入力した結果を破棄しました");
    expect(
      screen.getByText(/Set A: アプリの勝者 Alice → start.ggの勝者 Bob/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "確認" }));

    expect(
      screen.queryByText("アプリで入力した結果を破棄しました"),
    ).not.toBeInTheDocument();
    const card = await (await getDb()).get("matchCards", "s1");
    expect(card?.discardedLocalResult).toBeNull();
  });
});
