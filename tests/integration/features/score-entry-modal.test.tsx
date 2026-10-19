import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
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
  await screen.findByText(/進行ルールをまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

/**
 * ユーザーフィードバック(累積):
 * (1) ブラケット表示の対戦カードはJS側の絶対配置で積み上げているため、
 *     結果入力・進行中切替・対戦台選択等をカード内にインライン展開すると
 *     高さが対戦カード枠を超え、下の対戦カードに重なってボタンが押せなく
 *     なることがあった。
 * (2) カード自体には操作可能な要素(ボタン・プルダウン)を一切置かず、
 *     カード全体をタップすると編集モーダルが開く形に統一する。タップ
 *     できることを示す視覚的な合図として、右上(識別子の右端)に鉛筆
 *     アイコンを置くが、実際のタップ判定はカード全体。
 */
async function seedBracketPool(tableNumbers: string[] = ["1"]) {
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
    tableNumbers,
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

describe("Match cards on the bracket board have no operable elements; tapping the card opens an edit modal", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("does not render any button or select directly on the card, only a pencil icon as a tap affordance", async () => {
    await seedBracketPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");

    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(card.getAttribute("role")).toBe("button");
    expect(card).toHaveTextContent("✏️");
  });

  it("opens the edit modal when tapping anywhere on the card, and it contains the progress toggle, table select, and score entry", async () => {
    await seedBracketPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");
    // カードのどこ(選手名部分)をタップしても開く。
    await user.click(within(card).getByText("Alice"));

    const modalHeading = await screen.findByRole("heading", {
      name: "WFの編集",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(
      within(modal).getByRole("button", { name: "進行中" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("group", { name: "対戦台" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("group", { name: "Aliceのスコア" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("group", { name: "Bobのスコア" }),
    ).toBeInTheDocument();
  });

  it("leaves the result unchanged when the edit modal is closed without submitting", async () => {
    await seedBracketPool();
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
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByRole("heading", { name: "WFの編集" }),
    ).not.toBeInTheDocument();
    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("NOT_STARTED");
    expect(card1?.winnerId).toBeNull();
    expect(card1?.tableNumber).toBeNull();
  });

  it("submits the result and closes the modal when a score is confirmed", async () => {
    await seedBracketPool();
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
    const aliceGroup = within(modal).getByRole("group", {
      name: "Aliceのスコア",
    });
    await user.click(within(aliceGroup).getByRole("button", { name: "1" }));
    await user.click(within(modal).getByRole("button", { name: "結果を確定" }));

    expect(
      screen.queryByRole("heading", { name: "WFの編集" }),
    ).not.toBeInTheDocument();
    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("COMPLETED");
    expect(card1?.winnerId).toBe("e1");
  });

  it("sets the match to in-progress and assigns a table from inside the modal", async () => {
    await seedBracketPool(["1", "2"]);
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
    await user.click(within(modal).getByRole("button", { name: "進行中" }));
    const tableGroup = within(modal).getByRole("group", { name: "対戦台" });
    await user.click(within(tableGroup).getByRole("button", { name: "卓 2" }));

    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("IN_PROGRESS");
    expect(card1?.tableNumber).toBe("2");

    // 進行中バッジ・対戦台の表示は、カードを開かなくても分かるよう
    // モーダルを閉じた後もカード上に残る(操作自体は不可)。
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));
    expect(within(card).getByText("進行中")).toBeInTheDocument();
    expect(within(card).getByText("卓 2")).toBeInTheDocument();
    expect(within(card).queryAllByRole("button")).toHaveLength(0);

    // ユーザーフィードバック(2026-10-17): 進行中の対戦を開いたときにも
    // 「状態」区画が表示され、現在「進行中」であることが分かる
    // (以前は未着手の対戦でしか表示されず、進行中にした後にモーダルを
    // 開き直すと状態の表示自体が消えてしまっていた)。
    await user.click(card);
    const reopened = await screen.findByRole("heading", { name: "WFの編集" });
    const reopenedModal = reopened.closest(".app-modal") as HTMLElement;
    const stateGroup = within(reopenedModal).getByRole("group", {
      name: "状態",
    });
    expect(
      within(stateGroup).getByRole("button", { name: "進行中" }),
    ).toHaveClass("on");
    expect(
      within(stateGroup).getByRole("button", { name: "未着手" }),
    ).not.toHaveClass("on");

    // ユーザーフィードバック(2026-10-17): start.ggへまだ反映されていない
    // (statusLocalOnly)間は、「未着手」を押して取り消せる。
    await user.click(
      within(stateGroup).getByRole("button", { name: "未着手" }),
    );
    const card2 = await db.get("matchCards", "card-1");
    expect(card2?.status).toBe("NOT_STARTED");
    expect(card2?.statusLocalOnly).toBe(false);
  });

  it("does not revert an in-progress card to not-started once already reflected to start.gg", async () => {
    await seedBracketPool(["1"]);
    const db = await getDb();
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
      status: "IN_PROGRESS",
      // start.ggへの反映(markSetInProgress)が完了済みで、取り消すAPIが
      // 無いため「未着手」を押しても何も起きないはずのケース。
      statusLocalOnly: false,
      isLocked: false,
      editHistory: [],
      localOnly: false,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
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
    const stateGroup = within(modal).getByRole("group", { name: "状態" });
    await user.click(
      within(stateGroup).getByRole("button", { name: "未着手" }),
    );

    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("IN_PROGRESS");
  });

  it("does not make a locked completed card clickable (nothing left to edit)", async () => {
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
      ["e3", "Carol"],
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
      identifier: "R1-1",
      round: 1,
      bracketSide: "WINNERS",
      tableNumber: null,
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      score: "1-0",
      status: "COMPLETED",
      // 後続(R2)が既に完了しているため修正不可(computeIsLocked相当)。
      isLocked: true,
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
      winnerId: "e3",
      score: "0-1",
      status: "COMPLETED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: "card-1",
      entrant2SourceMatchId: null,
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const r1 = (await screen.findByText("R1-1")).closest("li");
    if (!r1) throw new Error("R1-1 card not found");
    expect(r1.getAttribute("role")).toBeNull();
    expect(r1).not.toHaveTextContent("✏️");

    // artifact更新(2026-10-17): 修正不可の注意書きは鍵マーク(クリックで
    // 開閉するツールチップ)で示す。
    const lockButton = within(r1).getByRole("button", {
      name: "結果は確定済み（修正不可）。理由を表示",
    });
    await user.click(lockButton);
    expect(
      within(r1).getByText(/後続の対戦（Set R2-1）が終わっているため/),
    ).toBeInTheDocument();

    await user.click(r1);
    expect(
      screen.queryByRole("heading", { name: "R1-1の編集" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * ユーザーフィードバック(2026-10-19): 対戦者(出場元の対戦の勝者)が
 * まだ確定していないカードでも、対戦台の割り当てだけは先にできるように
 * する(スコア入力・「進行中にする」は対戦者が決まってから)。
 */
describe("Assigning a table before both entrants are decided (2026-10-19)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedPendingSlotPool(tableNumbers: string[]) {
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
      tableNumbers,
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
    // card-2の片方(entrant1)はcard-1の勝者待ちでまだ未確定、もう片方
    // (entrant2)は確定済み、という組合せ。
    await db.put("matchCards", {
      id: "card-2",
      poolId: "pool-1",
      identifier: "R2-1",
      round: 2,
      bracketSide: "WINNERS",
      tableNumber: null,
      entrant1Id: null,
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

  it("opens the card and lets the table be assigned, without showing the state toggle or score entry", async () => {
    await seedPendingSlotPool(["1", "2"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("R2-1")).closest("li");
    if (!card) throw new Error("card not found");
    expect(card.getAttribute("role")).toBe("button");
    expect(card).toHaveTextContent("✏️");
    await user.click(card);

    const modalHeading = await screen.findByRole("heading", {
      name: "R2-1の編集",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(
      within(modal).getByText(
        "対戦者がまだ確定していません。前の対戦の結果入力を待っています。",
      ),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByRole("group", { name: "状態" }),
    ).not.toBeInTheDocument();
    expect(
      within(modal).queryByRole("group", { name: "Carolのスコア" }),
    ).not.toBeInTheDocument();

    const tableGroup = within(modal).getByRole("group", { name: "対戦台" });
    await user.click(within(tableGroup).getByRole("button", { name: "卓 2" }));

    const db = await getDb();
    const card2 = await db.get("matchCards", "card-2");
    expect(card2?.tableNumber).toBe("2");
    expect(card2?.entrant1Id).toBeNull();
    expect(card2?.status).toBe("NOT_STARTED");
  });

  it("shows only the waiting message when the pool has no table numbers configured", async () => {
    await seedPendingSlotPool([]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("R2-1")).closest("li");
    if (!card) throw new Error("card not found");
    await user.click(card);

    const modalHeading = await screen.findByRole("heading", {
      name: "R2-1の編集",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(
      within(modal).getByText(
        "対戦者がまだ確定していません。前の対戦の結果入力を待っています。",
      ),
    ).toBeInTheDocument();
    expect(within(modal).queryByRole("group")).not.toBeInTheDocument();
  });
});
