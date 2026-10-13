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

/** スコアは文字入力させず、DQ/0/1/2/3のボタンから選ぶ。 */
async function selectScore(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  entrantName: string,
  option: "DQ" | "0" | "1" | "2" | "3",
) {
  const group = within(container).getByRole("group", {
    name: `${entrantName}のスコア`,
  });
  await user.click(within(group).getByRole("button", { name: option }));
}

async function seedPoolWithTwoRounds() {
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
    bracketType: "SINGLE_ELIMINATION",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: false,
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put("matchCards", {
    id: "card-1",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e2",
    winnerId: "e1",
    score: null,
    status: "COMPLETED",
    isLocked: false,
    editHistory: [],
    localOnly: true,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
    entrant1Score: 0,
    entrant2Score: 0,
    entrant1DQ: false,
    entrant2DQ: false,
  });
  await db.put("matchCards", {
    id: "card-2",
    poolId: "pool-1",
    identifier: "R2-1",
    round: 2,
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: "e1",
    entrant2Id: "e3",
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: "card-1",
    entrant2SourceMatchId: null,
  });
}

describe("Match result correction (User Story 6)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPoolWithTwoRounds();
  });

  it("allows correcting a result while the downstream match has not started", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const r1 = (await screen.findByText("R1-1")).closest("li");
    if (!r1) throw new Error("round 1 card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダル(修正フォームを含む)が開く。
    await user.click(r1);
    await screen.findByRole("heading", { name: "R1-1の編集" });
    await selectScore(user, document.body, "Bob", "1");
    await user.click(screen.getByRole("button", { name: "修正を確定" }));

    expect(
      screen.queryByRole("heading", { name: "R1-1の編集" }),
    ).not.toBeInTheDocument();
    const db = await getDb();
    const card = await db.get("matchCards", "card-1");
    expect(card?.winnerId).toBe("e2");
  });

  it("rejects correction once the downstream match has progressed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    // 後続(R2)の結果を先に入力し、R1をロック状態にする。
    const r2 = (await screen.findByText("R2-1")).closest("li");
    if (!r2) throw new Error("round 2 card not found");
    await user.click(r2);
    await selectScore(user, document.body, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    const r1 = (await screen.findByText("R1-1")).closest("li");
    if (!r1) throw new Error("round 1 card not found");
    // 後続対戦が進行済みのため修正できず、カード自体もタップ不可
    // (role="button"を持たず、鉛筆アイコンも表示されない)になる。
    expect(r1.getAttribute("role")).toBeNull();
    expect(
      within(r1).queryByText("✏️", { selector: ".match-card-edit-icon" }),
    ).not.toBeInTheDocument();
    await user.click(r1);
    expect(
      screen.queryByRole("heading", { name: "R1-1の編集" }),
    ).not.toBeInTheDocument();
    expect(
      within(r1).getByText(/後続の対戦が進行しているため/),
    ).toBeInTheDocument();
  });
});
