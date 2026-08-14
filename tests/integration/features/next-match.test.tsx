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

async function openEntrantListModal(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/Alice vs Bob/).catch(() => undefined);
  await user.click(screen.getByRole("button", { name: "選手一覧" }));
}

describe("Next-match guidance for finished entrants (User Story 4)", () => {
  beforeEach(async () => {
    await resetDb();
    const db = await getDb();
    await db.put(
      "startggConfig",
      {
        tournamentSlug: "impact-major-4",
        eventId: "1",
        phaseId: "1",
        poolId: "pool-b",
        syncToken: "test-token",
        tokenUpdatedAt: null,
      },
      SINGLETON_KEY,
    );
    // 下位クラス(Bクラス以下)のプールでも、上位クラスと同じ扱いになる
    // ことを確認するため、意図的にBクラスのプールとして用意する(FR-020)。
    await db.put("pools", {
      id: "pool-b",
      displayIdentifier: "Pool B-1",
      tournamentSlug: "impact-major-4",
      eventId: "1",
      phaseId: "1",
      className: "Bクラス以下",
      bracketType: "ROUND_ROBIN",
      staffName: null,
      lastSyncedAt: null,
      onboardingCompletedAt: new Date().toISOString(),
    });
    await db.put("entrants", {
      id: "finished-entrant",
      poolId: "pool-b",
      name: "Charlie",
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: true,
      nextMatch: {
        opponentName: "Dana",
        tableNumber: "12",
        confirmed: true,
      },
      awayPeriods: [],
    });
    await db.put("entrants", {
      id: "unconfirmed-entrant",
      poolId: "pool-b",
      name: "Eve",
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: true,
      nextMatch: null,
      awayPeriods: [],
    });
    await db.put("entrants", {
      id: "in-progress-entrant",
      poolId: "pool-b",
      name: "Frank",
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: false,
      nextMatch: null,
      awayPeriods: [],
    });
  });

  it("shows confirmed opponent and table for a finished entrant, even in a lower-tier class pool", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openEntrantListModal(user);

    expect(
      await screen.findByText(/対戦相手 Dana \/ 卓 12/),
    ).toBeInTheDocument();
  });

  it('shows "未確定" when the next match is not yet confirmed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openEntrantListModal(user);

    expect(await screen.findByText(/次戦は未確定です/)).toBeInTheDocument();
  });

  it("does not list an entrant who has not finished the pool", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openEntrantListModal(user);

    await screen.findByText(/次戦は未確定です/);
    const banner = screen.getByText("予選通過・次戦案内").closest("section");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).not.toContain("Frank");
  });
});
