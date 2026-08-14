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
    // ROUND_ROBIN形式は現在非対応(PoolProgressScreen.tsxでブロックされる)
    // なため、このテストの本題(離席記録)とは無関係な一覧表示形式として
    // "OTHER"を使う(MatchTableへのルーティングはROUND_ROBIN/OTHER共通)。
    bracketType: "OTHER",
    staffName: null,
    lastSyncedAt: null,
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
}

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/注意事項をまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function openAwayModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "離席記録" }));
  const heading = await screen.findByRole("heading", { name: "離席記録" });
  const modal = heading.closest(".app-modal");
  if (!modal) throw new Error("away period modal not found");
  return modal as HTMLElement;
}

/**
 * ユーザーフィードバック(2026-08-14): 離席記録モーダル内で、離席した選手の
 * 横に離席開始時刻(日本時間)を表示する。データ自体(Entrant.awayPeriods
 * [].startedAt)は元々記録されていたが、モーダルに表示されていなかった。
 */
describe("Away period start time display (2026-08-14)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool();
  });

  it("shows a JST HH:MM time next to the entrant's name once marked away, and hides it again once they return", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const modal = await openAwayModal(user);
    const row = within(modal).getByText("Alice").closest("tr");
    if (!row) throw new Error("Alice row not found");
    expect(row.textContent).not.toMatch(/\d{2}:\d{2}〜/);

    await user.click(within(row).getByRole("button", { name: "離席" }));

    expect(row.textContent).toMatch(/\(\d{2}:\d{2}〜\)/);

    const db = await getDb();
    const entrant = await db.get("entrants", "entrant-1");
    expect(entrant?.awayPeriods).toHaveLength(1);
    expect(entrant?.awayPeriods[0].endedAt).toBeNull();
    expect(entrant?.awayPeriods[0].startedAt).not.toBeNull();

    await user.click(within(row).getByRole("button", { name: "戻った" }));
    expect(row.textContent).not.toMatch(/\d{2}:\d{2}〜/);
  });

  it("shows the entered reason next to the entrant's name (2026-08-14: reason was recorded but never displayed)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const modal = await openAwayModal(user);
    await user.type(within(modal).getByLabelText("理由(任意):"), "トイレ");
    const row = within(modal).getByText("Alice").closest("tr");
    if (!row) throw new Error("Alice row not found");
    await user.click(within(row).getByRole("button", { name: "離席" }));

    expect(row.textContent).toMatch(/\(\d{2}:\d{2}〜・トイレ\)/);

    const db = await getDb();
    const entrant = await db.get("entrants", "entrant-1");
    expect(entrant?.awayPeriods[0].reason).toBe("トイレ");
  });

  it("shows no reason suffix when the reason field is left blank", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const modal = await openAwayModal(user);
    const row = within(modal).getByText("Alice").closest("tr");
    if (!row) throw new Error("Alice row not found");
    await user.click(within(row).getByRole("button", { name: "離席" }));

    expect(row.textContent).toMatch(/\(\d{2}:\d{2}〜\)/);
    expect(row.textContent).not.toContain("・");
  });
});
