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
  await screen.findByText(/注意事項をまだ取得できていません/);
  await user.click(screen.getByRole("button", { name: "内容を確認しました" }));
}

async function goToAdminMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "管理画面" }));
}

describe("Admin mode (User Story 5)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects an incorrect password and accepts the bootstrapped one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await goToAdminMode(user);

    await user.type(screen.getByPlaceholderText("パスワード"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(
      await screen.findByText("初期化(ログイン〜対象プール指定〜トークン設定)"),
    ).toBeInTheDocument();
  });

  it("rejects a different password once one has been bootstrapped", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await goToAdminMode(user);
    await user.type(
      screen.getByPlaceholderText("パスワード"),
      "first-password",
    );
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    await screen.findByText("初期化(ログイン〜対象プール指定〜トークン設定)");

    // ログアウトして再度ゲートに戻り、別のパスワードでは入れないことを
    // 確認する(ブートストラップ済みのパスワードのみが有効)。
    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    await goToAdminMode(user);
    await user.type(
      screen.getByPlaceholderText("パスワード"),
      "wrong-password",
    );
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(
      await screen.findByText("パスワードが正しくありません。"),
    ).toBeInTheDocument();
  });

  it("completes initialization and allows independent pool/token reselection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await goToAdminMode(user);
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

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

  it("returns to general mode after manual logout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await goToAdminMode(user);
    await user.type(screen.getByPlaceholderText("パスワード"), "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    await screen.findByText("初期化(ログイン〜対象プール指定〜トークン設定)");

    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByText("予選プール進行")).toBeInTheDocument();
  });
});
