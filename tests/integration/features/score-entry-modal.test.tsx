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
  await screen.findByText(/注意事項をまだ取得できていません/);
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
      within(modal).getByRole("button", { name: "進行中にする" }),
    ).toBeInTheDocument();
    expect(within(modal).getByLabelText("対戦台:")).toBeInTheDocument();
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
    await user.click(
      within(modal).getByRole("button", { name: "進行中にする" }),
    );
    await user.selectOptions(within(modal).getByLabelText("対戦台:"), "2");

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
    expect(
      within(r1).getByText(/後続の対戦が進行しているため/),
    ).toBeInTheDocument();

    await user.click(r1);
    expect(
      screen.queryByRole("heading", { name: "R1-1の編集" }),
    ).not.toBeInTheDocument();
  });
});
