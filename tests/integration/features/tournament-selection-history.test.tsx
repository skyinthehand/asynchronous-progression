import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import { getDb } from "../../../src/infra/storage/db.js";
import { seedActiveAdminSession } from "../helpers/adminSession.js";

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
    {
      poolId: "pool-2",
      poolDisplayIdentifier: "Pool 2",
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

/**
 * 「直近の選択」の表示(大会名<strong>+イベント名+フェーズ名)はDOM上
 * 複数のテキストノードに分かれているため、1つの正規表現では
 * getByText/findByTextでマッチできない。要素を取得してtextContentで
 * まとめて検証する。
 */
async function findRecentSummary(
  tournamentName: string,
  eventName: string,
  phaseName: string,
) {
  const el = await screen.findByText(tournamentName, { selector: "strong" });
  const summary = el.closest(".tournament-drill-down-recent");
  expect(summary).toHaveTextContent(`${eventName} / ${phaseName}`);
  return summary;
}

/**
 * 「別セッション」を模した2回目のrenderでは、有効な管理セッションが
 * IndexedDBに残っているため、パスワード入力なしで直接管理画面に入る
 * (実際の挙動と同じ)。
 */
async function goToAdminMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "管理画面" }));
  const passwordInput = screen.queryByPlaceholderText("パスワード");
  if (passwordInput) {
    await user.type(passwordInput, "pw");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
  }
  // ログイン判定(verifyAdminPassword)が非同期(crypto.subtle.digest)の
  // ため、管理画面の内容が実際に描画されるまで待つ。
  await screen.findByRole("button", { name: "ログアウト" });
}

/** InitLoginの「大会一覧から選ぶ」経路で、プール選択まで完了させる。 */
async function completeInitLoginViaList(
  user: ReturnType<typeof userEvent.setup>,
  poolButtonIndex = 0,
) {
  await user.type(
    screen.getByPlaceholderText("Personal Access Token"),
    "pat-123",
  );
  await user.click(screen.getByRole("button", { name: "次へ" }));
  await user.click(screen.getByRole("button", { name: "大会一覧を取得" }));
  await user.click(await screen.findByRole("button", { name: "選択" }));
  await user.click(await screen.findByRole("button", { name: "選択" }));
  const poolButtons = await screen.findAllByRole("button", {
    name: "このプールを選択",
  });
  await user.click(poolButtons[poolButtonIndex]);
}

/**
 * ユーザーフィードバック(2026-10-18): 「直近の選択」のデフォルト表示は
 * ページ読み込み時(TournamentDrillDownのマウント時)の設定読み込みを
 * 前提にしているため、同一セッション内での即時反映は対象外(実際の
 * 使い方(日を跨いで同じ端末を再び使う)に合わせ、render→unmountで
 * 新しいセッションを模す)。
 */
describe("Tournament/event history and defaulting (2026-10-18)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedActiveAdminSession();
  });

  it("defaults to the most recently used tournament/event and only asks for the pool, in a later session", async () => {
    const user1 = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user1);
    await goToAdminMode(user1);
    await completeInitLoginViaList(user1, 0);

    const db = await getDb();
    expect((await db.get("startggConfig", "current"))?.poolId).toBe("pool-1");
    unmount();

    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);
    await goToAdminMode(user2);

    // 大会一覧取得・絞り込みをやり直さずに、直近の大会・イベントの表示と
    // 対象プールの選択肢がすぐに出る。
    await findRecentSummary(
      "IMPACT MAJOR #4",
      "Ultimate Singles",
      "予選プール",
    );
    expect(
      screen.queryByRole("button", { name: "大会一覧を取得" }),
    ).not.toBeInTheDocument();

    const poolButtons = await screen.findAllByRole("button", {
      name: "このプールを選択",
    });
    expect(poolButtons).toHaveLength(2);
    await user2.click(poolButtons[1]);

    const updated = await db.get("startggConfig", "current");
    expect(updated?.poolId).toBe("pool-2");
    // 大会・イベント・フェーズは変更されない。
    expect(updated?.tournamentSlug).toBe("impact-major-4");
    expect(updated?.eventId).toBe("e1");
    expect(updated?.phaseId).toBe("p1");
  });

  it('re-opens the full tournament/event drill-down only when "大会・イベントを変更" is pressed', async () => {
    const user1 = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user1);
    await goToAdminMode(user1);
    await completeInitLoginViaList(user1, 0);
    unmount();

    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);
    await goToAdminMode(user2);
    await findRecentSummary(
      "IMPACT MAJOR #4",
      "Ultimate Singles",
      "予選プール",
    );

    await user2.click(
      screen.getByRole("button", { name: "大会・イベントを変更" }),
    );

    expect(
      await screen.findByRole("button", { name: "大会一覧を取得" }),
    ).toBeInTheDocument();
  });

  it("offers previously used tournament slugs as one-click picks in the manual slug entry step", async () => {
    const user1 = userEvent.setup();
    const { unmount } = render(<App />);
    await acknowledgeNotice(user1);
    await goToAdminMode(user1);

    // 1回目: 大会一覧には出ない想定で、スラッグを手入力して進める。
    await user1.type(
      screen.getByPlaceholderText("Personal Access Token"),
      "pat-123",
    );
    await user1.click(screen.getByRole("button", { name: "次へ" }));
    await user1.type(
      screen.getByPlaceholderText("tournament-slug"),
      "impact-major-4",
    );
    await user1.click(
      screen.getByRole("button", { name: "このスラッグで進める" }),
    );
    await user1.click(await screen.findByRole("button", { name: "選択" }));
    const poolButtons1 = await screen.findAllByRole("button", {
      name: "このプールを選択",
    });
    await user1.click(poolButtons1[0]);
    unmount();

    // 2回目のセッション: 「大会・イベントを変更」から、手入力した
    // スラッグが履歴として選べる。
    const user2 = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user2);
    await goToAdminMode(user2);
    // 手入力したスラッグには大会名が分からないため、スラッグそのものが
    // 大会名として「直近の選択」に表示される。
    await findRecentSummary("impact-major-4", "Ultimate Singles", "予選プール");
    await user2.click(
      screen.getByRole("button", { name: "大会・イベントを変更" }),
    );

    await user2.click(
      await screen.findByRole("button", { name: "impact-major-4" }),
    );

    // スラッグを再入力することなく、次のイベント/フェーズ選択に進む。
    expect(
      await screen.findByRole("button", { name: "選択" }),
    ).toBeInTheDocument();
  });
});
