import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
  listMyTournaments: vi
    .fn()
    .mockResolvedValue([
      { tournamentSlug: "impact-major-4", tournamentName: "IMPACT MAJOR #4" },
    ]),
  listTournamentEvents: vi.fn().mockResolvedValue([
    {
      eventId: "e1",
      eventName: "Ultimate Singles",
      phases: [{ phaseId: "p1", phaseName: "予選プール" }],
    },
  ]),
  listPhasePools: vi.fn().mockResolvedValue([
    {
      poolId: "pool-1",
      poolDisplayIdentifier: "Pool 1",
      bracketType: "DOUBLE_ELIMINATION",
    },
  ]),
  // ユーザーフィードバック(2026-08-13): 対戦台はstartgg側のstation一覧
  // から選択する形になったため、管理画面のテストではstation一覧を
  // モックする。
  fetchStations: vi.fn().mockResolvedValue([
    { stationId: "900", number: "101" },
    { stationId: "901", number: "102" },
    { stationId: "902", number: "1" },
    { stationId: "903", number: "2" },
    { stationId: "904", number: "3" },
  ]),
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

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/進行ルールをまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
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
    // ROUND_ROBIN形式は現在非対応(PoolProgressScreen.tsxでブロックされる)
    // なため、対戦台割り当ての検証とは無関係な一覧表示形式として"OTHER"を
    // 使う(MatchTableへのルーティングはROUND_ROBIN/OTHER共通)。
    bracketType: "OTHER",
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
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "UNKNOWN",
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
  });
}

/**
 * FR-011: 対戦台の設定は管理画面で行う。管理画面はパスワード認証が必要
 * (初回入力したパスワードがそのままブートストラップされる、
 * admin.test.tsxと同じ規約)。対戦台は手入力ではなく、startggのstation
 * 一覧(fetchStationsのモック参照)からこのプールで使うものをチェック
 * ボックスで選択する。
 */
async function addTableFromAdminScreen(
  user: ReturnType<typeof userEvent.setup>,
  section: HTMLElement,
  tableNumber: string,
) {
  // 対象プールの読み込み・station一覧の取得(いずれも非同期)が完了する
  // まで、チェックボックス自体がまだ描画されていないことがあるため、
  // findByLabelTextで待つ。
  const checkbox = await within(section).findByLabelText(tableNumber);
  await user.click(checkbox);
}

describe("Table count setting and assignment (User Story 2)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sets the pool's table numbers from the admin screen, one at a time, and assigns one to a card", async () => {
    await seedPool([]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await user.click(screen.getByRole("button", { name: "管理画面" }));
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    const section = (
      await screen.findByRole("heading", { name: "対戦台" })
    ).closest("section");
    if (!section) throw new Error("table settings section not found");
    await addTableFromAdminScreen(user, section, "101");
    await addTableFromAdminScreen(user, section, "102");
    expect(within(section).getByText("101")).toBeInTheDocument();
    expect(within(section).getByText("102")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "進行画面に戻る" }));

    const select = await screen.findByLabelText("R1-1の対戦台");
    await user.selectOptions(select, "102");

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.tableNumber).toBe("102");
    const pool = await db.get("pools", "pool-1");
    expect(pool?.tableNumbers).toEqual(["101", "102"]);
  });

  /**
   * ユーザーフィードバック(2026-10-19): 対戦台はプールに割り当てられた
   * 全ての対戦台から選べるようにし、実際に進行中(IN_PROGRESS)の対戦との
   * 重複だけをブロックする(対戦者未確定でも事前に対戦台を割り当てられる
   * ようになり、プールの対戦カード数が対戦台数を上回るのが通常のため、
   * 未着手の対戦カード同士が同じ対戦台番号を仮に共有していても構わない)。
   */
  it("allows two not-started cards to share the same table number (2026-10-19)", async () => {
    await seedPool(["1", "2", "3"]);
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
    expect(card2?.tableNumber).toBe("2");
  });

  it("lets a not-started card pick a table already used by an in-progress card, without disabling it (2026-10-19)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select1 = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select1, "2");
    const row1 = screen.getByText("R1-1").closest("tr") as HTMLElement;
    await user.click(
      within(row1).getByRole("button", { name: "進行中にする" }),
    );

    // card-2は未着手のままなので、card-1(進行中)が使っている対戦台"2"も
    // 含め、どの対戦台も占有中扱いにならず自由に選べる。
    const select2 = await screen.findByLabelText("R1-2の対戦台");
    const option2 = within(select2).getByRole("option", {
      name: "2",
    }) as HTMLOptionElement;
    expect(option2.disabled).toBe(false);
    await user.selectOptions(select2, "2");

    const db = await getDb();
    const card2 = await db.get("matchCards", "card-2");
    expect(card2?.tableNumber).toBe("2");
  });

  it("rejects assigning a table already in use by another in-progress card (FR-014)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select1 = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select1, "2");
    const row1 = screen.getByText("R1-1").closest("tr") as HTMLElement;
    await user.click(
      within(row1).getByRole("button", { name: "進行中にする" }),
    );
    const row2 = screen.getByText("R1-2").closest("tr") as HTMLElement;
    await user.click(
      within(row2).getByRole("button", { name: "進行中にする" }),
    );

    const select2 = screen.getByLabelText("R1-2の対戦台");
    await user.selectOptions(select2, "2");

    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    const card2 = await db.get("matchCards", "card-2");
    expect(card1?.tableNumber).toBe("2");
    expect(card1?.status).toBe("IN_PROGRESS");
    expect(card2?.status).toBe("IN_PROGRESS");
    // 進行中同士で対戦台が重複するため、card-2の対戦台番号は変わらない。
    expect(card2?.tableNumber).toBeNull();
  });

  it("greys out (disables) a table option in use by another in-progress match once this card is also in-progress, and shows which match is using it", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select1 = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select1, "2");
    const row1 = screen.getByText("R1-1").closest("tr") as HTMLElement;
    await user.click(
      within(row1).getByRole("button", { name: "進行中にする" }),
    );
    const row2 = screen.getByText("R1-2").closest("tr") as HTMLElement;
    await user.click(
      within(row2).getByRole("button", { name: "進行中にする" }),
    );

    const select2 = await screen.findByLabelText("R1-2の対戦台");
    const occupiedOption = within(select2).getByRole("option", {
      name: "2(進行中: R1-1)",
    }) as HTMLOptionElement;
    expect(occupiedOption.disabled).toBe(true);
    // 空いている対戦台はそのまま選択できる。
    const freeOption = within(select2).getByRole("option", {
      name: "3",
    }) as HTMLOptionElement;
    expect(freeOption.disabled).toBe(false);

    // 自分自身が使用中の対戦台("2")は、select1自身の選択肢としては
    // 占有中扱いにならない(選び直しができる)。
    const ownSelect1 = screen.getByLabelText("R1-1の対戦台");
    const ownOption = within(ownSelect1).getByRole("option", {
      name: "2",
    }) as HTMLOptionElement;
    expect(ownOption.disabled).toBe(false);
  });

  it("keeps a locally-assigned table number after a sync merges remote data (FR-016)", async () => {
    await seedPool(["1", "2", "3"]);
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
    // 送信待ち(tableLocalOnly)の間は、startgg側がまだ追いついていない
    // 古いtableNumberで巻き戻らない。
    const remote = { ...local, tableNumber: null, localOnly: false };
    const merged = mergeMatchCard(local, remote);
    expect(merged.tableNumber).toBe("1");
  });

  /**
   * ユーザーフィードバック(2026-10-20): 送信(tableLocalOnly)が完了した
   * 後も対戦台番号を常にローカル優先にしていたため、start.gg側で対戦台が
   * 変更されても(別経路での変更・過去の送信失敗など)アプリの表示が
   * 古いまま更新されない不具合があった。送信完了後は、以後の同期で
   * start.gg側の最新値に追従する。
   */
  it("picks up a changed remote table number once the local push has already completed", async () => {
    await seedPool(["1", "2", "3"]);
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
    const pushed = await db.get("matchCards", "card-1");
    // 送信が完了した状態(tableLocalOnlyがクリア済み)を再現する。
    const local = { ...pushed, tableLocalOnly: false };
    const remote = { ...local, tableNumber: "3", localOnly: false };
    const merged = mergeMatchCard(local, remote);
    expect(merged.tableNumber).toBe("3");
  });

  it("takes isStreamed from the remote value (005-stream-match-lock)", async () => {
    await seedPool(["1", "2", "3"]);
    const { mergeMatchCard } = await import(
      "../../../src/features/sync/syncRunner.js"
    );
    const db = await getDb();
    const local = await db.get("matchCards", "card-1");
    const remote = { ...local, isStreamed: true, localOnly: false };
    const merged = mergeMatchCard({ ...local, isStreamed: false }, remote);
    expect(merged.isStreamed).toBe(true);
  });

  it("keeps the local isStreamed value while a result confirmation is still unsent (localOnly, 005-stream-match-lock Edge Cases)", async () => {
    await seedPool(["1", "2", "3"]);
    const db = await getDb();
    const local = await db.get("matchCards", "card-1");
    const { mergeMatchCard } = await import(
      "../../../src/features/sync/syncRunner.js"
    );
    // localOnly: true かつ winnerId未設定(=結果確定ではなく出場者反映
    // のみ)の場合はmergeMatchCardのlocalOnlyブロックの対象外(既存の
    // remoteCaughtUpWithAdvancement判定)になってしまうため、winnerIdを
    // 設定した「未送信の結果確定」を再現する。
    const localWithPendingResult = {
      ...local,
      localOnly: true,
      winnerId: "e1",
      isStreamed: false,
    };
    const remote = {
      ...local,
      isStreamed: true,
      localOnly: false,
      // remoteはまだ出場者反映が追いついていない状態(entrant1Id/2Idが
      // localと異なる)にして、remoteCaughtUpWithAdvancementがfalseに
      // なるようにする。
      entrant1Id: null,
    };
    const merged = mergeMatchCard(localWithPendingResult, remote);
    expect(merged.isStreamed).toBe(false);
  });

  it("lets the admin set up tables for a pool immediately after selecting it, without returning to general mode first", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    await user.click(screen.getByRole("button", { name: "管理画面" }));
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    const tableSection = (
      await screen.findByRole("heading", { name: "対戦台" })
    ).closest("section");
    if (!tableSection) throw new Error("table settings section not found");
    // 対象プールがまだ未設定の間は、対戦台の入力欄そのものが出ない。
    expect(
      within(tableSection).getByText(/対象プールが未設定です/),
    ).toBeInTheDocument();

    // 初期化フロー(PAT入力〜プール選択)を最後まで進める。
    await user.type(
      screen.getByPlaceholderText("Personal Access Token"),
      "pat-123",
    );
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "大会一覧を取得" }));
    await user.click(await screen.findByRole("button", { name: "選択" }));
    await user.click(await screen.findByRole("button", { name: "選択" }));
    await user.click(
      await screen.findByRole("button", { name: "このプールを選択" }),
    );

    // 一般モードへ一度戻らなくても、対戦台設定パネルが選択したプールに
    // 追従して更新され、station一覧から対戦台を選択できることを確認する。
    // (再マウントにより<section>要素自体が入れ替わるため、古い
    // tableSection参照ではなく改めてグローバルに探す。)
    const checkbox = await screen.findByLabelText("101");
    const refreshedSection = checkbox.closest("section");
    if (!refreshedSection) throw new Error("table settings section not found");
    await user.click(checkbox);
    expect(within(refreshedSection).getByText("101")).toBeInTheDocument();

    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    expect(pool?.tableNumbers).toEqual(["101"]);
  });

  it("shows a previously-selected table number as an orphan (removable) when it no longer matches a startgg station (2026-08-13)", async () => {
    await seedPool(["1", "999"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await user.click(screen.getByRole("button", { name: "管理画面" }));
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    const section = (
      await screen.findByRole("heading", { name: "対戦台" })
    ).closest("section");
    if (!section) throw new Error("table settings section not found");
    await within(section).findByLabelText("1");

    expect(within(section).getByText("999")).toBeInTheDocument();
    await user.click(
      within(section)
        .getByText("999")
        .closest("li")
        ?.querySelector("button") as HTMLButtonElement,
    );

    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    expect(pool?.tableNumbers).toEqual(["1"]);
  });

  it("shows a retry option when fetching the startgg station list fails", async () => {
    await seedPool([]);
    vi.mocked(operations.fetchStations).mockRejectedValueOnce(
      new Error("network error"),
    );
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await user.click(screen.getByRole("button", { name: "管理画面" }));
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    const section = (
      await screen.findByRole("heading", { name: "対戦台" })
    ).closest("section");
    if (!section) throw new Error("table settings section not found");
    await within(section).findByText(/対戦台一覧の取得に失敗しました/);

    await user.click(within(section).getByRole("button", { name: "再試行" }));
    expect(await within(section).findByLabelText("1")).toBeInTheDocument();
  });
});
