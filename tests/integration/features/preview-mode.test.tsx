import { render, screen } from "@testing-library/react";
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
 * ユーザーフィードバック(2026-08-13): start.gg側でブラケットが未開始
 * (対戦カードのIDがpreview形式)の間、結果入力・対戦台変更・進行中設定を
 * 一切できないようにする。開始後にIDが実IDへ切り替わった際のローカル
 * データの孤立を、そもそも記録させないことで回避する。
 */
async function seedPreviewModePool() {
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
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put("matchCards", {
    id: "preview_3068263_1_0",
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

describe("Preview mode (start.gg bracket not started yet)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPreviewModePool();
  });

  it("shows a preview-mode banner and does not open the edit modal when a card is tapped", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    expect(
      await screen.findByText(
        /start.gg側でこのプールのブラケットがまだ開始されていません/,
      ),
    ).toBeInTheDocument();

    const card = (await screen.findByText("WF")).closest("li");
    if (!card) throw new Error("card not found");
    await user.click(card);

    expect(screen.queryByText("WFの編集")).not.toBeInTheDocument();
  });

  it("disables the next-match suggestion button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    await screen.findByText("WF");
    expect(
      screen.getByRole("button", { name: "卓を選んで呼び出す" }),
    ).toBeDisabled();
  });
});
