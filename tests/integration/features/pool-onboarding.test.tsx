import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchEventRules: vi.fn().mockResolvedValue("緊急連絡先: 080-1234-5678"),
}));

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

async function seedFreshPool() {
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
    // なため、オンボーディングウィザードの検証とは無関係な一覧表示形式
    // として"OTHER"を使う(MatchTableへのルーティングはROUND_ROBIN/OTHER
    // 共通)。ただしROUND_ROBIN専用の自動生成は行われなくなるため、
    // 「Alice vs Bob」の対戦カードは明示的に用意する。
    bracketType: "OTHER",
    staffName: null,
    lastSyncedAt: null,
    // 未設定(初回)の状態を再現する。
    onboardingCompletedAt: null,
  });
  await db.put("entrants", {
    id: "e1",
    poolId: "pool-1",
    name: "Alice",
    attendance: "UNKNOWN",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
  });
  await db.put("entrants", {
    id: "e2",
    poolId: "pool-1",
    name: "Bob",
    attendance: "UNKNOWN",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
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

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "内容を確認しました" }),
  );
}

describe("Pool onboarding wizard (post-setup UI requirement)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedFreshPool();
  });

  it("walks through staff assignment, attendance, and the notice in order after pool setup", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const wizardHeading = await screen.findByText(/大会開始前の確認 \(1\/3\)/);
    const wizard = wizardHeading.closest(".app-modal");
    if (!wizard) throw new Error("wizard modal not found");

    // Step 1: 進行担当者
    expect(
      within(wizard).getByText("現在の担当者: 未設定"),
    ).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "次へ" }));

    // Step 2: 出欠確認
    await screen.findByText(/大会開始前の確認 \(2\/3\)/);
    expect(within(wizard).getByText("Alice")).toBeInTheDocument();
    expect(within(wizard).getByText("Bob")).toBeInTheDocument();
    await user.click(within(wizard).getByRole("button", { name: "次へ" }));

    // Step 3: 注意事項
    await screen.findByText(/大会開始前の確認 \(3\/3\)/);
    expect(
      await within(wizard).findByText(/緊急連絡先: 080-1234-5678/),
    ).toBeInTheDocument();

    await user.click(within(wizard).getByRole("button", { name: "完了" }));
    expect(screen.queryByText(/大会開始前の確認/)).not.toBeInTheDocument();

    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    expect(pool?.onboardingCompletedAt).not.toBeNull();
  });

  it("does not show the wizard again once completed, even after a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user);

    await screen.findByText(/大会開始前の確認 \(1\/3\)/);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    unmount();
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);
    await screen.findByText(/Alice vs Bob/);

    expect(screen.queryByText(/大会開始前の確認/)).not.toBeInTheDocument();
  });

  it("can be cancelled at any step without forcing completion", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    await screen.findByText(/大会開始前の確認 \(1\/3\)/);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByText(/大会開始前の確認/)).not.toBeInTheDocument();
    // 基本画面(トーナメント表)が操作可能になっていること。
    expect(await screen.findByText(/Alice vs Bob/)).toBeInTheDocument();

    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    expect(pool?.onboardingCompletedAt).not.toBeNull();
  });
});
