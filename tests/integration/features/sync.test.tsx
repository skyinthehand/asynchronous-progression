import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusSnackbar } from "../../../src/features/sync/SyncStatusSnackbar.js";
import { runSync } from "../../../src/features/sync/syncRunner.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/infra/startgg/operations.js")
    >();
  return {
    ...actual,
    fetchTournamentRules: vi.fn().mockResolvedValue(""),
    fetchPoolDetail: vi.fn(),
    reportMatchResult: vi.fn(),
    markSetInProgress: vi.fn().mockResolvedValue(undefined),
    assignStationToSet: vi.fn().mockResolvedValue(undefined),
    fetchStations: vi.fn().mockResolvedValue([]),
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
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
  });
}

describe("Background sync and offline notification (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedConfigAndPool();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.reportMatchResult).mockReset();
    vi.mocked(operations.markSetInProgress).mockClear();
    vi.mocked(operations.assignStationToSet).mockClear();
    vi.mocked(operations.fetchStations).mockClear();
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

  it("does not let a stale remote snapshot wipe out a locally-advanced losers-bracket entrant (FR-023)", async () => {
    // 報告されたバグの再現: 勝者側の対戦で負けたプレイヤーをローカルで
    // 敗者側カードへ反映した後(matchProgression.tsのadvanceWinner)、
    // startggへの結果送信(M1)がまだ反映されていない間に同期が走ると、
    // startgg側はまだその敗者側カードのentrantを知らない(null)ままなので、
    // mergeMatchCardがローカルの反映結果を上書きしてしまわないことを
    // 確認する。advanceWinnerが後続カードをlocalOnly: trueにしていれば、
    // ここで上書きされずに保護される。
    const db = await getDb();
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
    });
    await db.put("matchCards", {
      id: "w1",
      poolId: "pool-1",
      identifier: "WA",
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
      id: "l1",
      poolId: "pool-1",
      identifier: "J",
      round: -1,
      bracketSide: "LOSERS",
      tableNumber: null,
      // advanceWinnerがローカルで反映した状態(entrant1Id="e2", localOnly:true)を再現。
      entrant1Id: "e2",
      entrant2Id: null,
      winnerId: null,
      score: null,
      status: "NOT_STARTED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: null,
    });

    vi.mocked(operations.reportMatchResult).mockResolvedValue({
      winnerId: "e1",
      score: null,
      status: "COMPLETED",
    });
    // startgg側はまだこの結果を知らない想定: J(l1)のentrantはnullのまま。
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "DOUBLE_ELIMINATION",
      matchCards: [
        {
          id: "w1",
          poolId: "pool-1",
          identifier: "WA",
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
        },
        {
          id: "l1",
          poolId: "pool-1",
          identifier: "J",
          round: -1,
          bracketSide: "LOSERS",
          tableNumber: null,
          entrant1Id: null,
          entrant2Id: null,
          winnerId: null,
          score: null,
          status: "NOT_STARTED",
          isLocked: false,
          editHistory: [],
          localOnly: false,
          entrant1SourceMatchId: "w1",
          entrant2SourceMatchId: null,
        },
      ],
      entrants: [],
    });

    await runSync();

    const loserCard = await db.get("matchCards", "l1");
    expect(loserCard?.entrant1Id).toBe("e2");
  });

  it("clears localOnly once startgg catches up with a locally-advanced entrant, letting other remote fields flow through again (2026-08-15)", async () => {
    // 報告されたバグの再現: startgg側は既に最新のはずなのに「未反映N件」
    // が減らない。原因は、advanceWinnerによる出場者反映のみ
    // (winnerIdを持たない)のカードが、startgg側が実際に追いついた後も
    // 永久にlocalOnly: trueのままになってしまうこと(旧mergeMatchCardは
    // localOnly===trueなら常にローカルをそのまま返し、remoteが追いついた
    // かどうかを一切見ていなかった)。追いついた(remoteのentrantIdが
    // ローカルと一致する)場合はlocalOnlyを解除し、以降のremote更新
    // (対戦台番号等)も通常通り反映されることを確認する。
    const db = await getDb();
    // beforeEachで作られたcard-1(未送信の結果を持つ別カード)は、この
    // テストの検証対象外のため取り除いておく(送信先をl1だけにする)。
    await db.delete("matchCards", "card-1");
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
    });
    await db.put("matchCards", {
      id: "l1",
      poolId: "pool-1",
      identifier: "J",
      round: -1,
      bracketSide: "LOSERS",
      tableNumber: null,
      // advanceWinnerがローカルで反映した状態を再現(結果自体は持たない)。
      entrant1Id: "e2",
      entrant2Id: null,
      winnerId: null,
      score: null,
      status: "NOT_STARTED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: null,
    });

    // startgg側もついに追いついた想定: entrantId一致に加え、startgg側で
    // 設定された対戦台番号も新たに含める。
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "DOUBLE_ELIMINATION",
      matchCards: [
        {
          id: "l1",
          poolId: "pool-1",
          identifier: "J",
          round: -1,
          bracketSide: "LOSERS",
          tableNumber: "5",
          entrant1Id: "e2",
          entrant2Id: null,
          winnerId: null,
          score: null,
          status: "NOT_STARTED",
          isLocked: false,
          editHistory: [],
          localOnly: false,
          entrant1SourceMatchId: "w1",
          entrant2SourceMatchId: null,
        },
      ],
      entrants: [],
    });

    await runSync();

    const card = await db.get("matchCards", "l1");
    expect(card?.localOnly).toBe(false); // 追いついたので保護を解除する
    expect(card?.entrant1Id).toBe("e2");
    expect(card?.tableNumber).toBe("5"); // 解除後は他のremote更新も通る

    const status = await db.get("syncStatus", "pool-1");
    expect(status?.pendingChangeCount).toBe(0); // 「未反映N件」から消える
  });

  it("records a failure without losing local data when startgg is unreachable", async () => {
    vi.mocked(operations.reportMatchResult).mockRejectedValue(
      new Error("network error"),
    );
    // ユーザーフィードバック(2026-08-13): 送信失敗(1件)があっても、
    // それ以降のfetchPoolDetail以降(取得・マージ)は引き続き実行される
    // ため、このテストでも正常なレスポンスをモックしておく。
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
    expect(card?.localOnly).toBe(true); // ローカルデータは失われない
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastFailureReason).toBe("R1-1: network error");
  });

  it("skips preview-id cards (start.gg bracket not started yet) but still pushes other pending cards and completes fetch/merge", async () => {
    // ユーザーフィードバック(2026-08-13): preview IDへの送信は
    // 「Must start bracket before performing action」で拒否される。
    // これはエラー扱いにせず、他の非preview保留カードの送信・
    // fetchPoolDetail以降のマージ処理は正常に続行する。
    const db = await getDb();
    await db.put("matchCards", {
      id: "preview_pool-1_1_0",
      poolId: "pool-1",
      identifier: "R1-2",
      round: 1,
      bracketSide: "N/A",
      tableNumber: null,
      entrant1Id: "e3",
      entrant2Id: "e4",
      winnerId: "e3",
      score: null,
      status: "COMPLETED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
    });

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

    // preview IDのカードは送信対象から除外される(reportMatchResultは
    // 非previewのcard-1の分だけ1回呼ばれる)。
    expect(operations.reportMatchResult).toHaveBeenCalledTimes(1);
    const previewCard = await db.get("matchCards", "preview_pool-1_1_0");
    expect(previewCard?.localOnly).toBe(true);

    const card = await db.get("matchCards", "card-1");
    expect(card?.localOnly).toBe(false);

    // preview IDの保留が残っていても、これはエラーではないため
    // syncStatusはstaleにならない。
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastSuccessAt).not.toBeNull();
    expect(status?.isStale).toBe(false);
  });

  it("does not refresh lastSuccessAt on a genuine push failure, so repeated failures correctly become stale", async () => {
    const db = await getDb();
    const staleSuccessAt = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.put("syncStatus", {
      poolId: "pool-1",
      lastSuccessAt: staleSuccessAt,
      lastFailureAt: null,
      lastFailureReason: null,
      pendingChangeCount: 1,
      isStale: false,
    });
    vi.mocked(operations.reportMatchResult).mockRejectedValue(
      new Error("timeout"),
    );
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    await runSync();

    const status = await db.get("syncStatus", "pool-1");
    // 完全な成功ではないためlastSuccessAtは更新しない(preview ID待ちの
    // 正常な保留と区別し、真の繰り返し失敗を検知できるようにするため)。
    expect(status?.lastSuccessAt).toBe(staleSuccessAt);
    expect(status?.isStale).toBe(true);
  });

  it("pushes IN_PROGRESS status and the assigned table (station) to start.gg (2026-08-13)", async () => {
    const db = await getDb();
    await db.put("matchCards", {
      id: "card-2",
      poolId: "pool-1",
      identifier: "R1-2",
      round: 1,
      bracketSide: "N/A",
      tableNumber: "1",
      entrant1Id: "e3",
      entrant2Id: "e4",
      winnerId: null,
      score: null,
      status: "IN_PROGRESS",
      isLocked: false,
      editHistory: [],
      localOnly: false,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
      statusLocalOnly: true,
    });
    vi.mocked(operations.fetchStations).mockResolvedValue([
      { stationId: "900", number: "1" },
      { stationId: "901", number: "2" },
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    await runSync();

    expect(operations.markSetInProgress).toHaveBeenCalledWith(
      expect.anything(),
      "card-2",
    );
    expect(operations.assignStationToSet).toHaveBeenCalledWith(
      expect.anything(),
      "card-2",
      "900",
    );
    const card = await db.get("matchCards", "card-2");
    expect(card?.statusLocalOnly).toBe(false);
  });

  it("clears statusLocalOnly (does not retry forever) when the local table number has no matching start.gg station", async () => {
    const db = await getDb();
    await db.put("matchCards", {
      id: "card-2",
      poolId: "pool-1",
      identifier: "R1-2",
      round: 1,
      bracketSide: "N/A",
      tableNumber: "99",
      entrant1Id: "e3",
      entrant2Id: "e4",
      winnerId: null,
      score: null,
      status: "IN_PROGRESS",
      isLocked: false,
      editHistory: [],
      localOnly: false,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
      statusLocalOnly: true,
    });
    vi.mocked(operations.fetchStations).mockResolvedValue([
      { stationId: "900", number: "1" },
    ]);
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    await runSync();

    expect(operations.markSetInProgress).toHaveBeenCalledWith(
      expect.anything(),
      "card-2",
    );
    expect(operations.assignStationToSet).not.toHaveBeenCalled();
    const card = await db.get("matchCards", "card-2");
    expect(card?.statusLocalOnly).toBe(false);
  });

  it("does not let a stale remote snapshot revert a locally in-progress status before it has been pushed", async () => {
    // mergeMatchCardのstatus保護: statusLocalOnlyがtrueの間は、startgg側の
    // 古いstatus(NOT_STARTED)で上書きしない。
    const db = await getDb();
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
      status: "IN_PROGRESS",
      isLocked: false,
      editHistory: [],
      localOnly: false,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
      statusLocalOnly: true,
    });
    // M2の送信自体は失敗する(まだstartgg側は知らない)想定。
    vi.mocked(operations.markSetInProgress).mockRejectedValueOnce(
      new Error("network error"),
    );
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [
        {
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
          statusLocalOnly: false,
        },
      ],
      entrants: [],
    });

    await runSync();

    const card = await db.get("matchCards", "card-2");
    expect(card?.status).toBe("IN_PROGRESS"); // startgg側のNOT_STARTEDで巻き戻らない
    expect(card?.statusLocalOnly).toBe(true); // 次回同期で再送信される
  });

  it("keeps the error detail collapsed by default, expanding only when the summary is opened (2026-08-14)", async () => {
    const db = await getDb();
    await db.put("syncStatus", {
      poolId: "pool-1",
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: new Date().toISOString(),
      lastFailureReason:
        "Must start bracket before performing action: {very long raw API response...}",
      pendingChangeCount: 1,
      isStale: true,
    });

    render(<SyncStatusSnackbar />);
    const details = (await screen.findByText("詳細")).closest("details");
    if (!details) throw new Error("details element not found");
    expect(details).not.toHaveAttribute("open");

    const user = userEvent.setup();
    await user.click(screen.getByText("詳細"));
    expect(details).toHaveAttribute("open");
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
      await screen.findByText(/初回同期にまだ成功していません/),
    ).toBeInTheDocument();
    // ユーザーフィードバック(2026-08-14): エラー詳細は開かないと見えない
    // (details/summary)ようにしたため、開く前でもDOM上には存在する
    // (詳細を開かなくても長い文字列で邪魔にならない)ことを確認する。
    expect(screen.getByText("詳細")).toBeInTheDocument();
    expect(screen.getByText("network error")).toBeInTheDocument();

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
          screen.queryByText(/初回同期にまだ成功していません/),
        ).not.toBeInTheDocument(),
      { timeout: 6000 },
    );
  }, 10000);
});
