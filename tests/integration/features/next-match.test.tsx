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

async function openGuideTab(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/Alice vs Bob/).catch(() => undefined);
  await user.click(screen.getByRole("tab", { name: /次戦案内/ }));
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
      // ROUND_ROBIN形式は現在非対応(PoolProgressScreen.tsxでブロックされる)
      // なため、次戦案内の検証とは無関係な一覧表示形式として"OTHER"を使う
      // (MatchTableへのルーティングはROUND_ROBIN/OTHER共通)。
      bracketType: "OTHER",
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
      seed: null,
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
      seed: null,
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
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  });

  it("shows confirmed opponent and table for a finished entrant, even in a lower-tier class pool", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openGuideTab(user);

    const card = screen.getByText("Charlie").closest("article");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Dana");
    expect(card?.textContent).toContain("卓 12");
  });

  it('shows "未確定" when the next match is not yet confirmed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openGuideTab(user);

    const card = screen.getByText("Eve").closest("article");
    expect(card?.textContent).toContain("未確定");
  });

  it("does not list an entrant who has not finished the pool", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await openGuideTab(user);

    await screen.findByText("Charlie");
    expect(screen.queryByText("Frank")).not.toBeInTheDocument();
  });
});
