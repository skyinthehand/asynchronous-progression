import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchTournamentRules: vi.fn().mockRejectedValue(new Error("offline")),
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
 * admin.test.tsxと同じ規約)。対戦台は「N台」という数値ではなく、会場の
 * 実際の卓番号(101, 102, ...のように連番とは限らない)を1台ずつ手入力する。
 */
async function addTableFromAdminScreen(
  user: ReturnType<typeof userEvent.setup>,
  section: HTMLElement,
  tableNumber: string,
) {
  // 対象プールの読み込み(非同期)が完了するまで、対戦台番号の入力欄自体が
  // まだ描画されていないことがあるため、findByLabelTextで待つ。
  const input = await within(section).findByLabelText("対戦台番号");
  await user.type(input, tableNumber);
  await user.click(within(section).getByRole("button", { name: "追加" }));
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

    await user.click(screen.getByRole("button", { name: "一般モードへ戻る" }));

    const select = await screen.findByLabelText("R1-1の対戦台");
    await user.selectOptions(select, "102");

    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.tableNumber).toBe("102");
    const pool = await db.get("pools", "pool-1");
    expect(pool?.tableNumbers).toEqual(["101", "102"]);
  });

  it("rejects assigning a table already occupied by another incomplete card (FR-014)", async () => {
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
    // 占有中の対戦台への割り当ては拒否され、card-2の対戦台番号は変わらない。
    expect(card2?.tableNumber).toBeNull();
  });

  it("greys out (disables) a table option already in use and shows which match is using it, without affecting the assigning card's own table", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    const select1 = screen.getByLabelText("R1-1の対戦台");
    await user.selectOptions(select1, "2");

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
    const ownOption = within(select1).getByRole("option", {
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
    const remote = { ...local, tableNumber: null, localOnly: false };
    const merged = mergeMatchCard(local, remote);
    expect(merged.tableNumber).toBe("1");
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
    // 追従して更新され、対戦台番号を追加できることを確認する。
    // (再マウントにより<section>要素自体が入れ替わるため、古い
    // tableSection参照ではなく改めてグローバルに探す。)
    const input = await screen.findByLabelText("対戦台番号");
    const refreshedSection = input.closest("section");
    if (!refreshedSection) throw new Error("table settings section not found");
    await user.type(input, "101");
    await user.click(
      within(refreshedSection).getByRole("button", { name: "追加" }),
    );
    expect(within(refreshedSection).getByText("101")).toBeInTheDocument();

    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    expect(pool?.tableNumbers).toEqual(["101"]);
  });
});
