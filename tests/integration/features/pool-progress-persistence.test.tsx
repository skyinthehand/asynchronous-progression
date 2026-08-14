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
    // ROUND_ROBIN形式は現在非対応(PoolProgressScreen.tsxでブロックされる。
    // 専用の検証は下の"blocks..."テスト参照)なため、それ以外のこのファイル
    // のテストでは無関係な一覧表示形式として"OTHER"を使う(MatchTableへの
    // ルーティングはROUND_ROBIN/OTHER共通)。ROUND_ROBIN専用の自動生成は
    // 行われなくなるため、対戦カードは明示的に用意する。
    bracketType: "OTHER",
    staffName: null,
    lastSyncedAt: null,
    // オンボーディングウィザードは別テスト(pool-onboarding.test.tsx)で
    // 個別に検証するため、ここでは既完了扱いにして通常画面の検証に集中する。
    onboardingCompletedAt: new Date().toISOString(),
  });
  await db.put("entrants", {
    id: "entrant-1",
    poolId: "pool-1",
    name: "Alice",
    attendance: "UNKNOWN",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
  });
  await db.put("entrants", {
    id: "entrant-2",
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
    entrant1Id: "entrant-1",
    entrant2Id: "entrant-2",
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
  await screen.findByText(/注意事項をまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function openAttendanceModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "出欠確認" }));
  const heading = await screen.findByRole("heading", { name: "出欠確認" });
  const modal = heading.closest(".app-modal");
  if (!modal) throw new Error("attendance modal not found");
  return modal as HTMLElement;
}

describe("Pool progress offline persistence (User Story 2)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool();
  });

  it("shows the pool's basic content once loaded", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    expect(await screen.findByText("Pool 1")).toBeInTheDocument();
    expect(await screen.findByText(/Alice vs Bob/)).toBeInTheDocument();
  });

  it("blocks the pool progress screen for round-robin pools (not yet supported, 2026-08-17)", async () => {
    const db = await getDb();
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
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    expect(
      await screen.findByText(/総当り形式のプールは現在非対応です/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Alice vs Bob/)).not.toBeInTheDocument();
  });

  it("shows tournament/event/phase/pool names in the header when available", async () => {
    const db = await getDb();
    const pool = await db.get("pools", "pool-1");
    await db.put("pools", {
      ...pool,
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      phaseName: "予選プール",
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "IMPACT MAJOR #4 - Ultimate Singles - 予選プール - Pool 1",
      }),
    ).toBeInTheDocument();
  });

  it("hides staff/attendance/away/entrant panels behind toolbar buttons by default", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText(/Alice vs Bob/);

    expect(screen.queryByText("現在の担当者")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("cell", { name: "Alice" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "進行担当者" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "出欠確認" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "離席記録" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "選手一覧" }),
    ).toBeInTheDocument();
  });

  it("persists attendance (recorded via the modal) across a simulated reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText(/Alice vs Bob/);

    const modal = await openAttendanceModal(user);
    const aliceRow = within(modal).getByText("Alice").closest("tr");
    if (!aliceRow) throw new Error("Alice row not found");
    await user.click(within(aliceRow).getByRole("button", { name: "出席" }));

    expect(
      within(aliceRow).getByRole("cell", { name: "出席" }),
    ).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    // 端末の強制終了・再起動を模して、コンポーネントツリーを作り直す。
    unmount();
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);
    await screen.findByText(/Alice vs Bob/);

    const reopenedModal = await openAttendanceModal(user2);
    const reloadedAliceRow = within(reopenedModal)
      .getByText("Alice")
      .closest("tr");
    if (!reloadedAliceRow) throw new Error("Alice row not found");
    expect(
      within(reloadedAliceRow).getByRole("cell", { name: "出席" }),
    ).toBeInTheDocument();
  });

  it("records a match result and persists it across a reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user);

    await screen.findByText(/Alice vs Bob/);
    const aliceGroup = screen.getByRole("group", { name: "Aliceのスコア" });
    await user.click(within(aliceGroup).getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();

    unmount();
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
  });
});
