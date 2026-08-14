import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { PrintPage } from "../../../src/features/print/PrintPage.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";
import { getEntrantsByPool } from "../../../src/infra/storage/entrantRepository.js";
import { getMatchCardsByPool } from "../../../src/infra/storage/matchCardRepository.js";
import { getPool } from "../../../src/infra/storage/poolRepository.js";

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

async function seedConfig() {
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
  await db.put("entrants", {
    id: "e1",
    poolId: "pool-1",
    name: "Alice",
    attendance: "PRESENT",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
  });
  await db.put("entrants", {
    id: "e2",
    poolId: "pool-1",
    name: "Bob",
    attendance: "PRESENT",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
  });
}

/**
 * 印刷用ページへの入口ボタン(PoolProgressScreenの「印刷用ページ」)は
 * 現在disabledのため(ユーザーフィードバック: 現状動作していない)、
 * PrintPage自体の描画ロジックはApp経由ではなく直接レンダリングして
 * 検証する。
 */
async function renderPrintPage() {
  const [pool, matchCards, entrants] = await Promise.all([
    getPool("pool-1"),
    getMatchCardsByPool("pool-1"),
    getEntrantsByPool("pool-1"),
  ]);
  if (!pool) throw new Error("pool-1 not found");
  render(
    <PrintPage
      pool={pool}
      matchCards={matchCards}
      entrants={entrants}
      onClose={() => {}}
    />,
  );
}

describe("Print page (User Story 7)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedConfig();
  });

  it("renders a bracket layout with header/footer for elimination pools", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
    });
    await db.put("matchCards", {
      id: "card-1",
      poolId: "pool-1",
      identifier: "R1-1",
      round: 1,
      bracketSide: "WINNERS",
      tableNumber: "3",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      score: "2-0",
      status: "COMPLETED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
    });

    await renderPrintPage();

    expect(screen.getByText("Pool 1")).toBeInTheDocument();
    expect(screen.getByText("IMPACT MAJOR #4")).toBeInTheDocument();
    expect(screen.getByText("Judge:")).toBeInTheDocument();
    expect(screen.getByText("Winners")).toBeInTheDocument();
    expect(screen.getByText(/Generated on/)).toBeInTheDocument();
    expect(screen.getByText(/勝者: Alice \(2-0\)/)).toBeInTheDocument();
  });

  it("renders a table layout for round-robin pools", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
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
    });

    await renderPrintPage();

    expect(screen.queryByText("Winners")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("未着手")).toBeInTheDocument();
  });

  it("hides the print/close controls from the printed output via the no-print class", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
    });

    await renderPrintPage();

    const printButton = screen.getByRole("button", { name: "印刷" });
    expect(printButton.closest(".no-print")).not.toBeNull();
    const closeButton = screen.getByRole("button", { name: "閉じる" });
    expect(closeButton.closest(".no-print")).not.toBeNull();
  });

  it("renders a DQ-derived score string as-is (002-match-scoring-and-flow T030)", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
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
      // resolveMatchResult()が組み立てる導出値の例(entrant2がDQ)。
      score: "0-DQ",
      status: "COMPLETED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
      entrant1Score: 0,
      entrant2Score: null,
      entrant1DQ: false,
      entrant2DQ: true,
    });

    await renderPrintPage();

    expect(screen.getByText(/勝者: Alice \(0-DQ\)/)).toBeInTheDocument();
  });

  it("renders a W-derived score string (winner known, score unknown) as-is", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
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
      // resolveMatchResult()が組み立てる導出値の例(entrant1がW)。
      score: "W-0",
      status: "COMPLETED",
      isLocked: false,
      editHistory: [],
      localOnly: true,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
      entrant1Score: null,
      entrant2Score: 0,
      entrant1DQ: false,
      entrant2DQ: false,
      entrant1W: true,
      entrant2W: false,
    });

    await renderPrintPage();

    expect(screen.getByText(/勝者: Alice \(W-0\)/)).toBeInTheDocument();
  });

  it("disables the '印刷用ページ' entry button on the pool progress screen (currently non-functional)", async () => {
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
      tournamentName: "IMPACT MAJOR #4",
      eventName: "Ultimate Singles",
      onboardingCompletedAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText(/Alice vs Bob/);

    const printButton = screen.getByRole("button", { name: "印刷用ページ" });
    expect(printButton).toBeDisabled();
  });
});
