import { render, screen, within } from "@testing-library/react";
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

function card(overrides: Record<string, unknown>) {
  return {
    id: "card",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "N/A",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    ...overrides,
  };
}

/**
 * ユーザーフィードバック(2026-08-14): 次戦候補表示時、出場者のどちらかが
 * 離席中の対戦は優先度を最下位にする。対戦台を設定しない(空配列)場合は
 * プール全体で1件の「最有力」候補のみが選ばれるため、この設定で
 * R1-1(通常なら最優先)の出場者を離席にすると、代わりにR1-2が候補になる
 * ことを確認する。
 */
async function seedPool() {
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
    // ROUND_ROBIN形式は現在非対応(PoolProgressScreen.tsxでブロックされる)
    // なため、次戦候補ロジックの検証とは無関係な一覧表示形式として"OTHER"
    // を使う(MatchTableへのルーティングはROUND_ROBIN/OTHER共通)。
    bracketType: "OTHER",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
    tableNumbers: [],
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
    ["e4", "Dave"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "UNKNOWN",
      attendanceRecordedAt: null,
      poolFinished: false,
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put(
    "matchCards",
    card({
      id: "card-1",
      identifier: "R1-1",
      entrant1Id: "e1",
      entrant2Id: "e2",
    }),
  );
  await db.put(
    "matchCards",
    card({
      id: "card-2",
      identifier: "R1-2",
      entrant1Id: "e3",
      entrant2Id: "e4",
    }),
  );
}

describe("Next-match suggestion deprioritizes matches with an away entrant (2026-08-14)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPool();
  });

  it("suggests R1-2 instead of R1-1 once R1-1's entrant is marked away", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    // まずは何もしていない状態で、通常通りR1-1が最有力候補であることを確認する。
    await user.click(
      screen.getByRole("button", { name: "卓を選んで呼び出す" }),
    );
    const firstModalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const firstModal = firstModalHeading.closest(".app-modal") as HTMLElement;
    expect(within(firstModal).getByText("R1-1")).toBeInTheDocument();
    await user.click(
      within(firstModal).getByRole("button", { name: "閉じる" }),
    );

    // R1-1の出場者(Alice)を離席にする。
    await user.click(screen.getByRole("tab", { name: /選手/ }));
    const aliceRow = screen.getByText("Alice").closest("tr");
    if (!aliceRow) throw new Error("Alice row not found");
    await user.click(
      within(aliceRow).getByRole("button", { name: "離席する" }),
    );

    // 離席後は、R1-1ではなくR1-2が次戦候補になる(NEXTカードはタブに
    // 関わらず常時表示されるため、タブを切り替え直す必要はない)。
    await user.click(
      screen.getByRole("button", { name: "卓を選んで呼び出す" }),
    );
    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();
    expect(within(modal).queryByText("R1-1")).not.toBeInTheDocument();
  });

  it("shows the away start time and reason in the next-match modal when the only candidate has an away entrant (2026-08-14)", async () => {
    const db = await getDb();
    // card-2を削除し、離席中の出場者を含むcard-1だけを候補にする(それでも
    // 候補としては提示されるはずなので、その中に離席情報が出ることを確認)。
    await db.delete("matchCards", "card-2");

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("R1-1");

    await user.click(screen.getByRole("tab", { name: /選手/ }));
    await user.type(screen.getByLabelText("離席理由(任意):"), "トイレ");
    const aliceRow = screen.getByText("Alice").closest("tr");
    if (!aliceRow) throw new Error("Alice row not found");
    await user.click(
      within(aliceRow).getByRole("button", { name: "離席する" }),
    );

    await user.click(
      screen.getByRole("button", { name: "卓を選んで呼び出す" }),
    );
    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-1")).toBeInTheDocument();
    expect(within(modal).getByRole("alert").textContent).toMatch(
      /Aliceが離席中です\(\d{2}:\d{2}〜・トイレ\)/,
    );
  });
});
