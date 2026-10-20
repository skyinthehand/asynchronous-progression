import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import type { checkAndApplyAutoLogout as CheckAndApplyAutoLogout } from "../../../src/features/admin/sessionExpiry.js";
import { getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
}));

vi.mock(
  "../../../src/features/admin/sessionExpiry.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/features/admin/sessionExpiry.js")
      >();
    return {
      ...actual,
      checkAndApplyAutoLogout: vi.fn(actual.checkAndApplyAutoLogout),
    };
  },
);

const sessionExpiry = await import(
  "../../../src/features/admin/sessionExpiry.js"
);
const actualSessionExpiry = await vi.importActual<
  typeof import("../../../src/features/admin/sessionExpiry.js")
>("../../../src/features/admin/sessionExpiry.js");

async function resetDb() {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

type CheckResult = Awaited<ReturnType<typeof CheckAndApplyAutoLogout>>;

/**
 * ユーザーフィードバック(2026-10-20、/code-reviewの指摘): アプリ全体が
 * 管理画面ログインで囲まれたことで、ログイン状態の読み込み(AdminSession
 * Context)の不具合がアプリ全体の表示に影響するようになったケース。
 */
describe("Admin session loading (app-wide login gate)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(sessionExpiry.checkAndApplyAutoLogout)
      .mockClear()
      .mockImplementation(actualSessionExpiry.checkAndApplyAutoLogout);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the login screen (not a blank page) when reading the stored session fails", async () => {
    vi.mocked(sessionExpiry.checkAndApplyAutoLogout).mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
    render(<App />);

    expect(await screen.findByText("管理画面ログイン")).toBeInTheDocument();
    expect(screen.getByText("パスワードを忘れた場合")).toBeInTheDocument();
  });

  it("does not let a periodic check that started before login overwrite the new session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    render(<App />);
    await screen.findByText("管理画面ログイン");

    // 定期確認(60秒間隔)が「未ログイン」の状態を読み込み中のまま、ログインする。
    let resolveStaleCheck: (result: CheckResult) => void = () => {};
    vi.mocked(sessionExpiry.checkAndApplyAutoLogout).mockImplementationOnce(
      () =>
        new Promise<CheckResult>((resolve) => {
          resolveStaleCheck = resolve;
        }),
    );
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(sessionExpiry.checkAndApplyAutoLogout).toHaveBeenCalledTimes(2);

    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    await screen.findByText(/進行ルールをまだ取得できていません/);

    await act(async () => {
      resolveStaleCheck({ justAutoLoggedOut: false, session: undefined });
    });

    expect(screen.queryByText("管理画面ログイン")).not.toBeInTheDocument();
    expect(
      screen.getByText(/進行ルールをまだ取得できていません/),
    ).toBeInTheDocument();
  });
});
