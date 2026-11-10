import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

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
 * 進行ルールを確認して管理画面へ入る。ユーザーフィードバック(2026-11-09):
 * パスワードによるログインは廃止したため、そのまま入れる。
 */
async function enterAdmin(user: ReturnType<typeof userEvent.setup>) {
  await acknowledgeNotice(user);
  await goToAdminMode(user);
  await screen.findByText("初期化(ログイン〜対象プール指定〜トークン設定)");
}

describe("Admin mode (User Story 5)", () => {
  beforeEach(async () => {
    await resetDb();
    // リセットで消えることを確かめるための、保存済みのstart.gg連携設定。
    const db = await getDb();
    await db.put(
      "startggConfig",
      {
        tournamentSlug: null,
        eventId: null,
        phaseId: null,
        poolId: null,
        syncToken: null,
        tokenUpdatedAt: null,
      },
      SINGLETON_KEY,
    );
  });

  it("opens the admin screen without asking for a password, and has no logout (2026-11-09)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAdmin(user);

    expect(screen.queryByPlaceholderText("パスワード")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ログアウト" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "進行画面に戻る" }));
    expect(await screen.findByText("予選プール進行")).toBeInTheDocument();
  });

  it("completes initialization and allows independent pool/token reselection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterAdmin(user);

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

  it("shows the β banner on every screen (temporary development release, 2026-11-09)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/進行ルールをまだ取得できていません/);
    expect(screen.getByText("β版")).toBeInTheDocument();

    await acknowledgeNotice(user);
    await screen.findByText("予選プール進行");
    expect(screen.getByText("β版")).toBeInTheDocument();
  });

  describe("Reset (2026-08-19)", () => {
    it("clears every object store, including the start.gg settings, once confirmed", async () => {
      const user = userEvent.setup();
      render(<App />);
      await enterAdmin(user);

      const db = await getDb();
      expect(await db.get("startggConfig", SINGLETON_KEY)).toBeDefined();

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
      await enterAdmin(user);

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
      expect(await db.get("startggConfig", SINGLETON_KEY)).toBeDefined();

      confirmSpy.mockRestore();
    });
  });
});
