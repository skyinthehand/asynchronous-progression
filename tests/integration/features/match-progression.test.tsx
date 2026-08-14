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
  entrantName: string,
  option: "DQ" | "0" | "1" | "2" | "3",
) {
  const group = screen.getByRole("group", { name: `${entrantName}のスコア` });
  await user.click(within(group).getByRole("button", { name: option }));
}

/**
 * R2-1のentrant1Idはあえてnull(未着手・未同期の状態を再現)。startggの
 * 同期を待たずローカルでR1-1の結果を入力した場合でも、R2-1側にR1-1の
 * 勝者が反映されるかを検証する。
 */
async function seedPoolAwaitingAdvancement() {
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
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: null,
    entrant2SourceMatchId: null,
  });
  await db.put("matchCards", {
    id: "card-2",
    poolId: "pool-1",
    identifier: "R2-1",
    round: 2,
    bracketSide: "WINNERS",
    tableNumber: null,
    entrant1Id: null,
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

describe("Winner advancement to the next round (FR-023)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPoolAwaitingAdvancement();
  });

  it("fills the next round's entrant slot with the winner instead of leaving it BYE", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const r1Card = (await screen.findByText("R1-1")).closest("li");
    if (!r1Card) throw new Error("R1-1 card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダルが開く。
    await user.click(r1Card);
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    // 結果確定直後は次戦候補のモーダルが自動表示される(FR-022)ため、
    // 一覧側の要素を一意に特定できるよう閉じておく。
    await user.click(await screen.findByRole("button", { name: "閉じる" }));

    await screen.findByText("R2-1");
    const db = await getDb();
    const card2 = await db.get("matchCards", "card-2");
    expect(card2?.entrant1Id).toBe("e1");

    const r2 = screen.getByText("R2-1").closest("li");
    if (!r2) throw new Error("round 2 card not found");
    expect(r2.textContent).toContain("Alice");
    expect(r2.textContent).not.toContain("BYE");
  });
});

/**
 * 勝者側(WINNERS)の対戦で負けたプレイヤーが、敗者側(LOSERS)の対戦に
 * 反映されるかを検証する(報告されたバグ: 敗者側に反映されなかった)。
 */
async function seedPoolAwaitingLoserDrop() {
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
    bracketType: "DOUBLE_ELIMINATION",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "PRESENT",
      attendanceRecordedAt: null,
      poolFinished: false,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put("matchCards", {
    id: "w1",
    poolId: "pool-1",
    identifier: "WA",
    round: 1,
    bracketSide: "WINNERS",
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
  });
  await db.put("matchCards", {
    id: "l1",
    poolId: "pool-1",
    identifier: "J",
    round: -1,
    bracketSide: "LOSERS",
    tableNumber: null,
    entrant1Id: null,
    entrant2Id: null,
    winnerId: null,
    score: null,
    status: "NOT_STARTED",
    isLocked: false,
    editHistory: [],
    localOnly: false,
    entrant1SourceMatchId: "w1",
    entrant2SourceMatchId: null,
  });
}

describe("Loser drop into the losers bracket (FR-023)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedPoolAwaitingLoserDrop();
  });

  it("sends the losing player (not the winner) into the losers-bracket slot", async () => {
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const waCard = (await screen.findByText("WA")).closest("li");
    if (!waCard) throw new Error("WA card not found");
    // カード自体をタップして編集モーダルを開く。
    await user.click(waCard);
    // Aliceが勝つ = Bobが負けて敗者側に落ちる。
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    // このプールは出場者が2名しかおらず、Jはentrant1(Bob)しか埋まらない
    // (対戦相手が存在しない、不戦勝相当の状態)。003-next-match-priority-fix
    // のFR-001により、両方の枠が確定していない対戦は次戦候補として自動
    // 表示されないため、次戦候補モーダルは表示されない。

    await screen.findByText("J");
    const db = await getDb();
    const loserCard = await db.get("matchCards", "l1");
    expect(loserCard?.entrant1Id).toBe("e2");

    const j = screen.getByText("J").closest("li");
    if (!j) throw new Error("losers card not found");
    expect(j.textContent).toContain("Bob");
    expect(j.textContent).not.toContain("Alice");
  });
});
