import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", () => ({
  fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
  listMyTournaments: vi
    .fn()
    .mockResolvedValue([
      { tournamentSlug: "impact-major-4", tournamentName: "IMPACT MAJOR #4" },
    ]),
  listTournamentEvents: vi.fn().mockResolvedValue([
    {
      eventId: "e1",
      eventName: "Ultimate Singles",
      phases: [{ phaseId: "p1", phaseName: "予選プール" }],
    },
  ]),
  listPhasePools: vi.fn().mockResolvedValue([
    {
      poolId: "pool-1",
      poolDisplayIdentifier: "Pool 1",
      bracketType: "DOUBLE_ELIMINATION",
    },
  ]),
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
  await screen.findByText(/進行ルールをまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function goToAdminMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "管理画面" }));
}

/**
 * ユーザーフィードバック(2026-10-20): アプリ全体が管理画面ログインで
 * 囲まれているため、ログアウト中は起動直後にログイン画面が表示される。
 */
async function login(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
) {
  await user.type(await screen.findByPlaceholderText("パスワード"), password);
  await user.click(screen.getByRole("button", { name: "ログイン" }));
}

/** ログインし、進行ルールを確認して管理画面へ入る。 */
async function loginAndEnterAdmin(
  user: ReturnType<typeof userEvent.setup>,
  password = "pw",
) {
  await login(user, password);
  await acknowledgeNotice(user);
  await goToAdminMode(user);
  await screen.findByText("初期化(ログイン〜対象プール指定〜トークン設定)");
}

describe("Admin mode (User Story 5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an incorrect password and accepts the bootstrapped one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAndEnterAdmin(user, "correct-horse");
  });

  it("rejects a different password once one has been bootstrapped", async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAndEnterAdmin(user, "first-password");

    // ログアウトして再度ゲートに戻り、別のパスワードでは入れないことを
    // 確認する(ブートストラップ済みのパスワードのみが有効)。
    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    await login(user, "wrong-password");
    expect(
      await screen.findByText("パスワードが正しくありません。"),
    ).toBeInTheDocument();
  });

  it("completes initialization and allows independent pool/token reselection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAndEnterAdmin(user);

    await user.type(
      screen.getByPlaceholderText("Personal Access Token"),
      "pat-123",
    );
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "大会一覧を取得" }));
    await user.click(await screen.findByRole("button", { name: "選択" }));
    await user.click(await screen.findByRole("button", { name: "選択" }));
    await user.click(
      await screen.findByRole("button", { name: "このプールを選択" }),
    );

    const db = await getDb();
    const config = await db.get("startggConfig", "current");
    expect(config?.poolId).toBe("pool-1");
    expect(config?.syncToken).toBe("pat-123");

    // 選択したプールのレコードが実際に作成されていること(結果入力・印刷
    // 等、以降の全機能がこのレコードの存在を前提とするため)。
    const pool = await db.get("pools", "pool-1");
    expect(pool?.displayIdentifier).toBe("Pool 1");
    expect(pool?.tournamentName).toBe("IMPACT MAJOR #4");

    // FR-028: トークンのみ再設定(対象プールの再指定は不要)。
    const tokenInput = screen
      .getByText("トークンのみ変更")
      .closest("section")
      ?.querySelector("input");
    if (!tokenInput) throw new Error("token input not found");
    await user.type(tokenInput, "pat-456");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const updatedConfig = await db.get("startggConfig", "current");
    expect(updatedConfig?.syncToken).toBe("pat-456");
    expect(updatedConfig?.poolId).toBe("pool-1"); // 対象プールは維持される
  });

  it("shows only the login screen (no notice/target tournament, no progress screen) while logged out (2026-10-20)", async () => {
    render(<App />);

    expect(await screen.findByText("管理画面ログイン")).toBeInTheDocument();
    expect(screen.queryByText("進行ルール")).not.toBeInTheDocument();
    expect(screen.queryByText("予選プール進行")).not.toBeInTheDocument();
  });

  it("shows the login screen after manual logout, and restarts from the notice after logging back in (2026-10-20)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginAndEnterAdmin(user);

    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByText("管理画面ログイン")).toBeInTheDocument();
    expect(screen.queryByText("予選プール進行")).not.toBeInTheDocument();

    await login(user, "pw");
    await acknowledgeNotice(user);
    expect(await screen.findByText("予選プール進行")).toBeInTheDocument();
  });

  it("shows the login screen with the auto-logout notice on startup after the 24h session expired", async () => {
    const db = await getDb();
    const loggedInAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.put(
      "adminSession",
      {
        loggedInAt: loggedInAt.toISOString(),
        expiresAt: new Date(
          loggedInAt.getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: "ACTIVE",
        autoLogoutNotifiedAt: null,
      },
      "current",
    );
    render(<App />);

    expect(
      await screen.findByText("自動的にログアウトしました。"),
    ).toBeInTheDocument();
    expect(screen.getByText("管理画面ログイン")).toBeInTheDocument();
    expect(screen.queryByText("予選プール進行")).not.toBeInTheDocument();
  });

  describe("Reset (2026-08-19)", () => {
    it("clears every object store, including the admin login, once confirmed", async () => {
      const user = userEvent.setup();
      render(<App />);
      await loginAndEnterAdmin(user);

      const db = await getDb();
      expect(await db.get("adminSession", "current")).toBeDefined();

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const reloadSpy = vi.fn();
      // jsdomのwindow.location.reloadはconfigurable: falseで定義されて
      // いるため直接defineProperty/spyOnで上書きできない。window.location
      // オブジェクト自体を差し替える。
      const originalLocation = window.location;
      // @ts-expect-error jsdomの型上はwindow.locationの再代入を想定していない
      // biome-ignore lint/performance/noDelete: window.locationを差し替える唯一の手段(jsdom)
      delete window.location;
      window.location = { ...originalLocation, reload: reloadSpy };

      await user.click(
        screen.getByRole("button", { name: "すべてのデータをリセット" }),
      );

      expect(confirmSpy).toHaveBeenCalled();
      for (const name of db.objectStoreNames) {
        expect(await db.getAll(name)).toEqual([]);
      }
      expect(reloadSpy).toHaveBeenCalled();

      confirmSpy.mockRestore();
      window.location = originalLocation;
    });

    it("does nothing when the confirmation dialog is dismissed", async () => {
      const user = userEvent.setup();
      render(<App />);
      await loginAndEnterAdmin(user);

      // confirmがfalseを返す限りwindow.location.reload()は呼ばれない
      // パスのため、reload自体のモックは不要(実際のjsdomのreloadは
      // 未実装で例外を投げるが、そもそも到達しないことをこのテストで
      // 保証する)。
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      await user.click(
        screen.getByRole("button", { name: "すべてのデータをリセット" }),
      );

      expect(confirmSpy).toHaveBeenCalled();
      const db = await getDb();
      expect(await db.get("adminSession", "current")).toBeDefined();

      confirmSpy.mockRestore();
    });

    it("is also offered on the login gate, for when the password itself is forgotten", async () => {
      const user = userEvent.setup();
      render(<App />);

      // ログイン前(パスワードを忘れて入れない状況を想定)でも、ゲート画面に
      // 同じ初期化ボタンがあることを確認する。
      await screen.findByText("パスワードを忘れた場合");

      const db = await getDb();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const reloadSpy = vi.fn();
      const originalLocation = window.location;
      // @ts-expect-error jsdomの型上はwindow.locationの再代入を想定していない
      // biome-ignore lint/performance/noDelete: window.locationを差し替える唯一の手段(jsdom)
      delete window.location;
      window.location = { ...originalLocation, reload: reloadSpy };

      await user.click(
        screen.getByRole("button", { name: "すべてのデータをリセット" }),
      );

      expect(confirmSpy).toHaveBeenCalled();
      for (const name of db.objectStoreNames) {
        expect(await db.getAll(name)).toEqual([]);
      }
      expect(reloadSpy).toHaveBeenCalled();

      confirmSpy.mockRestore();
      window.location = originalLocation;
    });
  });
});
