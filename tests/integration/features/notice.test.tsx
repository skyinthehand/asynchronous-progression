import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";
import { seedActiveAdminSession } from "../helpers/adminSession.js";

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

describe("Notice gate (User Story 1)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedActiveAdminSession();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks the app until the notice is acknowledged, even with no cache yet", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(/進行ルールをまだ取得できていません/),
    ).toBeInTheDocument();
    expect(screen.queryByText("予選プール進行")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "内容を確認しました" }),
    );

    expect(screen.getByText("予選プール進行")).toBeInTheDocument();
  });

  it("shows the cached notice body and re-view button after acknowledgement", async () => {
    const db = await getDb();
    await db.put(
      "startggConfig",
      {
        tournamentSlug: "impact-major-4",
        eventId: "1",
        phaseId: "1",
        poolId: "1",
        syncToken: "test-token",
        tokenUpdatedAt: null,
      },
      SINGLETON_KEY,
    );
    await db.put("notice", {
      tournamentSlug: "impact-major-4",
      body: "遅刻・キャンセルはDiscordまでご連絡ください。",
      hasEmergencyContact: true,
      lastSyncedAt: null,
    });

    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(/遅刻・キャンセルはDiscordまでご連絡ください/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "内容を確認しました" }),
    );
    expect(screen.getByText("予選プール進行")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "進行ルール" }));
    await waitFor(() =>
      expect(
        screen.getAllByText(/遅刻・キャンセルはDiscordまでご連絡ください/)
          .length,
      ).toBeGreaterThan(0),
    );
  });

  it("renders the notice body as Markdown (heading + list elements, not literal '#'/'-') (2026-08-15)", async () => {
    const db = await getDb();
    await db.put(
      "startggConfig",
      {
        tournamentSlug: "impact-major-4",
        eventId: "1",
        phaseId: "1",
        poolId: "1",
        syncToken: "test-token",
        tokenUpdatedAt: null,
      },
      SINGLETON_KEY,
    );
    await db.put("notice", {
      tournamentSlug: "impact-major-4",
      body: "# プール進行注意事項\n- 離席記録に登録してください\n- 連絡先: Discord",
      hasEmergencyContact: true,
      lastSyncedAt: null,
    });

    render(<App />);

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "プール進行注意事項",
    });
    expect(heading).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(
      within(list).getByText("離席記録に登録してください"),
    ).toBeInTheDocument();
    expect(within(list).getByText("連絡先: Discord")).toBeInTheDocument();
    // 生のMarkdown記号がそのまま文字として出ていない(構造化されている)ことも確認する。
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it("warns when the synced notice has no detectable emergency contact", async () => {
    const db = await getDb();
    await db.put(
      "startggConfig",
      {
        tournamentSlug: "impact-major-4",
        eventId: "1",
        phaseId: "1",
        poolId: "1",
        syncToken: "test-token",
        tokenUpdatedAt: null,
      },
      SINGLETON_KEY,
    );
    await db.put("notice", {
      tournamentSlug: "impact-major-4",
      body: "よろしくお願いします。",
      hasEmergencyContact: false,
      lastSyncedAt: null,
    });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/よろしくお願いします/);
    await user.click(
      screen.getByRole("button", { name: "内容を確認しました" }),
    );

    expect(
      await screen.findByText(/緊急時の連絡方法の記載が確認できません/),
    ).toBeInTheDocument();
  });
});
