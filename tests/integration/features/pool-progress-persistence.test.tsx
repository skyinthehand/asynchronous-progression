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
    bracketType: "ROUND_ROBIN",
    staffName: null,
    lastSyncedAt: null,
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
}

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/注意事項をまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

describe("Pool progress offline persistence (User Story 2)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool();
  });

  it("generates round-robin match cards for a freshly seeded pool", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    expect(await screen.findByText("Pool 1")).toBeInTheDocument();
    expect(await screen.findByText(/Alice vs Bob/)).toBeInTheDocument();
  });

  it("persists attendance across a simulated reload", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user);

    const attendanceSection = (await screen.findByText("出欠確認")).closest(
      "section",
    );
    if (!attendanceSection) throw new Error("attendance section not found");
    const aliceRow = within(attendanceSection as HTMLElement)
      .getByText("Alice")
      .closest("tr");
    if (!aliceRow) throw new Error("Alice row not found");
    await user.click(within(aliceRow).getByRole("button", { name: "出席" }));

    expect(
      within(aliceRow).getByRole("cell", { name: "出席" }),
    ).toBeInTheDocument();

    // 端末の強制終了・再起動を模して、コンポーネントツリーを作り直す。
    unmount();
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);

    const reloadedSection = (await screen.findByText("出欠確認")).closest(
      "section",
    );
    if (!reloadedSection) throw new Error("attendance section not found");
    const reloadedAliceRow = within(reloadedSection as HTMLElement)
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
    const winButton = screen.getByRole("button", { name: "Alice の勝ち" });
    await user.click(winButton);

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();

    unmount();
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);

    expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
  });
});
