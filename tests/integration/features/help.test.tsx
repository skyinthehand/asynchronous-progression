import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { getDb } from "../../../src/infra/storage/db.js";

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

describe("Help button (docs/usage.md viewer)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is available on the very first screen, before the notice is acknowledged", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/注意事項をまだ取得できていません/);
    expect(screen.queryByText("予選プール進行")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "使い方を表示" }));

    const heading = await screen.findByRole("heading", { name: "使い方" });
    const modal = heading.closest(".app-modal");
    if (!modal) throw new Error("help modal not found");
    expect(
      within(modal).getByText(/予選プール進行デジタル管理ツールの使い方/),
    ).toBeInTheDocument();
  });

  it("stays available after acknowledging the notice, and can be closed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "内容を確認しました" }),
    );

    await user.click(screen.getByRole("button", { name: "使い方を表示" }));
    const heading = await screen.findByRole("heading", { name: "使い方" });
    const modal = heading.closest(".app-modal");
    if (!modal) throw new Error("help modal not found");

    await user.click(within(modal).getByRole("button", { name: "閉じる" }));
    expect(
      screen.queryByRole("heading", { name: "使い方" }),
    ).not.toBeInTheDocument();
  });
});
