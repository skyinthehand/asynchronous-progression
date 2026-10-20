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
 * ユーザーフィードバック(2026-10-18): 管理画面に入らなくても、同期済み
 * 表示の横からその場でstart.ggへ手動で同期できるようにする。
 */
describe("Manual sync button next to the sync chip (general screen)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedActiveAdminSession();
    await seedConfiguredPool();
    vi.mocked(operations.fetchPoolDetail).mockReset();
    vi.mocked(operations.reportMatchResult).mockReset();
  });

  it("runs a sync and reports success without entering admin mode", async () => {
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

    await user.click(await screen.findByRole("button", { name: "今すぐ同期" }));

    expect(await screen.findByText("同期しました")).toBeInTheDocument();
    expect(operations.fetchPoolDetail).toHaveBeenCalledTimes(1);

    const db = await getDb();
    const status = await db.get("syncStatus", "pool-1");
    expect(status?.lastSuccessAt).not.toBeNull();
  });

  it("reports failure inline when the manual sync fails", async () => {
    vi.mocked(operations.fetchPoolDetail).mockRejectedValue(
      new Error("network error"),
    );

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    await user.click(await screen.findByRole("button", { name: "今すぐ同期" }));

    expect(
      await screen.findByText("同期に失敗しました: network error"),
    ).toBeInTheDocument();
  });

  it("disables the button while a sync is in flight", async () => {
    let resolveFetch!: (value: {
      poolId: string;
      displayIdentifier: string;
      bracketType: "ROUND_ROBIN";
      matchCards: never[];
      entrants: never[];
    }) => void;
    vi.mocked(operations.fetchPoolDetail).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const button = await screen.findByRole("button", { name: "今すぐ同期" });
    await user.click(button);

    expect(
      await screen.findByRole("button", { name: "同期中…" }),
    ).toBeDisabled();

    resolveFetch({
      poolId: "pool-1",
      displayIdentifier: "Pool 1",
      bracketType: "ROUND_ROBIN",
      matchCards: [],
      entrants: [],
    });

    expect(
      await screen.findByRole("button", { name: "今すぐ同期" }),
    ).not.toBeDisabled();
  });
});
