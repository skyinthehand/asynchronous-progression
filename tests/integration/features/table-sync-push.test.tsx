import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/infra/startgg/operations.js")
    >();
  return {
    ...actual,
    fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
    fetchPoolDetail: vi.fn(),
    markSetInProgress: vi.fn().mockResolvedValue(undefined),
    assignStationToSet: vi.fn().mockResolvedValue(undefined),
    fetchStations: vi.fn().mockResolvedValue([
      { stationId: "station-1", number: "1" },
      { stationId: "station-2", number: "2" },
    ]),
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

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/進行ルールをまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function seedPool() {
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
    tableNumbers: ["1", "2"],
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: false,
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put("matchCards", {
    id: "card-1",
    poolId: "pool-1",
    identifier: "WF",
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
  });
}

/**
 * ユーザーフィードバック(2026-10-19): 「対戦台の情報がstartggに反映
 * されない」。原因は、状態(進行中にする)を変えずに対戦台だけを割り当てた
 * 場合、usePoolProgress.tsのassignTable()がstatusLocalOnlyを立てていな
 * かったため、runSync()のpush対象(getPendingMatchCards)に含まれず、
 * assignStationToSetが一切呼ばれていなかったこと。
 */
describe("Table assignment is pushed to start.gg (2026-10-19)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.assignStationToSet).mockClear();
    vi.mocked(operations.markSetInProgress).mockClear();
  });

  it("sends assignStationToSet for a table assigned without changing the match status", async () => {
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "SINGLE_ELIMINATION",
      matchCards: [
        {
          id: "card-1",
          poolId: "pool-1",
          identifier: "WF",
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
          isStreamed: false,
        },
      ],
      entrants: [],
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");
    await user.click(card);

    const modalHeading = await screen.findByRole("heading", {
      name: "WFの編集",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    const tableGroup = within(modal).getByRole("group", { name: "対戦台" });
    // 状態(進行中にする)には一切触れず、対戦台だけを設定する。
    await user.click(within(tableGroup).getByRole("button", { name: "卓 2" }));

    const db = await getDb();
    const beforeSync = await db.get("matchCards", "card-1");
    expect(beforeSync?.tableNumber).toBe("2");
    expect(beforeSync?.status).toBe("NOT_STARTED");
    // 対戦台だけの変更でも、start.ggへの送信待ちキューに乗る。
    expect(beforeSync?.statusLocalOnly).toBe(true);

    await user.click(within(modal).getByRole("button", { name: "閉じる" }));
    await user.click(await screen.findByRole("button", { name: "今すぐ同期" }));
    await screen.findByText("同期しました");

    expect(operations.assignStationToSet).toHaveBeenCalledWith(
      expect.anything(),
      "card-1",
      "station-2",
    );
    // 状態は変えていないので、進行中への送信は行われない。
    expect(operations.markSetInProgress).not.toHaveBeenCalled();

    const afterSync = await db.get("matchCards", "card-1");
    expect(afterSync?.statusLocalOnly).toBe(false);
    expect(afterSync?.tableNumber).toBe("2");
  });
});
