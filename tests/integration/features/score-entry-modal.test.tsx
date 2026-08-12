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

/**
 * ユーザーフィードバック: ブラケット表示の対戦カードはJS側の絶対配置で
 * 積み上げているため、スコア入力フォーム(進行中バッジ・対戦台選択・
 * 両選手分のDQ/0/1/2/3/Wボタン・エラーメッセージ・結果を確定ボタン)を
 * インライン展開すると高さが対戦カード枠を超え、下の対戦カードに重なって
 * ボタンが押せなくなることがあった。対戦カード自体は「識別子・選手名・
 * ボタン」のみの一定の高さに保ち、詳細な結果入力はモーダルに分離する。
 */
async function seedBracketPool() {
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
    tableNumbers: ["1"],
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

describe("Score entry is collapsed into a modal on the bracket board", () => {
  beforeEach(async () => {
    await resetDb();
    await seedBracketPool();
  });

  it("does not render the score-entry form inline; opens it in a modal via a compact button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");

    // 初期表示では、対戦カードにスコア入力用のgroup(選手ごとのDQ/0/1/2/3/W
    // ボタン群)が展開されていない。
    expect(
      within(card).queryByRole("group", { name: "Aliceのスコア" }),
    ).not.toBeInTheDocument();
    // 対戦台選択・進行中トグル等、軽量な操作はそのままカード内にある。
    expect(
      within(card).getByRole("button", { name: "進行中にする" }),
    ).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "結果を入力" }));

    const modalHeading = await screen.findByRole("heading", {
      name: "WFの結果",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(
      within(modal).getByRole("group", { name: "Aliceのスコア" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByRole("group", { name: "Bobのスコア" }),
    ).toBeInTheDocument();
  });

  it("leaves the result unchanged when the score-entry modal is closed without submitting", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");
    await user.click(within(card).getByRole("button", { name: "結果を入力" }));

    const modalHeading = await screen.findByRole("heading", {
      name: "WFの結果",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByRole("heading", { name: "WFの結果" }),
    ).not.toBeInTheDocument();
    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("NOT_STARTED");
    expect(card1?.winnerId).toBeNull();
  });

  it("submits the result and closes the modal when a score is confirmed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");
    await user.click(within(card).getByRole("button", { name: "結果を入力" }));

    const modalHeading = await screen.findByRole("heading", {
      name: "WFの結果",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    const aliceGroup = within(modal).getByRole("group", {
      name: "Aliceのスコア",
    });
    await user.click(within(aliceGroup).getByRole("button", { name: "1" }));
    await user.click(within(modal).getByRole("button", { name: "結果を確定" }));

    expect(
      screen.queryByRole("heading", { name: "WFの結果" }),
    ).not.toBeInTheDocument();
    const db = await getDb();
    const card1 = await db.get("matchCards", "card-1");
    expect(card1?.status).toBe("COMPLETED");
    expect(card1?.winnerId).toBe("e1");
  });
});
