import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";
import { seedActiveAdminSession } from "../helpers/adminSession.js";

vi.mock("../../../src/infra/startgg/operations.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/infra/startgg/operations.js")
    >();
  return {
    ...actual,
    fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
    fetchPoolDetail: vi.fn(),
    reportMatchResult: vi.fn(),
    // TableSettingsPanel(管理画面)は表示のたびにstartggのstation一覧を
    // 取得しようとするため、実際のネットワーク呼び出しを避けるためモック
    // する(2026-08-13)。
    fetchStations: vi.fn().mockResolvedValue([]),
  };
});

const operations = await import("../../../src/infra/startgg/operations.js");

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

async function acknowledgeNotice(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(/進行ルールをまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function seedConfiguredPool() {
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
}

/**
 * ユーザーフィードバック(2026-08-13): start.gg側で「Start Bracket」を
 * 押した後、次の定期同期(最大60秒後)を待たずにすぐデータを取り込める
 * よう、管理画面に手動再取得ボタンを設けた。
 */
describe("Manual data refetch button (admin screen)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedActiveAdminSession();
    await seedConfiguredPool();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.reportMatchResult).mockReset();
  });

  it("runs the same sync as the background scheduler and reports success", async () => {
    vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await user.click(screen.getByRole("button", { name: "管理画面" }));

    await user.click(
      await screen.findByRole("button", { name: "データを再取得" }),
    );

    expect(
      await screen.findByText("データを再取得しました。"),
    ).toBeInTheDocument();
    expect(operations.fetchPoolDetail).toHaveBeenCalledTimes(1);

    const db = await getDb();
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastSuccessAt).not.toBeNull();
  });

  it("reports failure inline when the refetch fails", async () => {
    vi.mocked(operations.fetchPoolDetail).mockRejectedValue(
      new Error("network error"),
    );

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await user.click(screen.getByRole("button", { name: "管理画面" }));

    await user.click(
      await screen.findByRole("button", { name: "データを再取得" }),
    );

    expect(
      await screen.findByText("再取得に失敗しました: network error"),
    ).toBeInTheDocument();
  });
});
