import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchTournamentRules: vi.fn().mockResolvedValue("緊急連絡先: 080-1234-5678"),
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
    bracketType: "ROUND_ROBIN",
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
