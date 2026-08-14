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

async function seedPool(tableNumbers: string[]) {
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
    bracketType: "ROUND_ROBIN",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
    tableNumbers,
  });
  for (const [id, name] of [
    ["e1", "Alice"],
    ["e2", "Bob"],
    ["e3", "Carol"],
    ["e4", "Dave"],
    ["e5", "Eve"],
    ["e6", "Frank"],
  ]) {
    await db.put("entrants", {
      id,
      poolId: "pool-1",
      name,
      attendance: "UNKNOWN",
      attendanceRecordedAt: null,
      poolFinished: false,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put(
    "matchCards",
    card({
      id: "card-1",
      identifier: "R1-1",
      tableNumber: "1",
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
  await db.put(
    "matchCards",
    card({
      id: "card-3",
      identifier: "R1-3",
      entrant1Id: "e5",
      entrant2Id: "e6",
    }),
  );
}

async function completeCard1(user: ReturnType<typeof userEvent.setup>) {
  const identifier = await screen.findByText("R1-1");
  const row = identifier.closest("tr");
  if (!row) throw new Error("R1-1 row not found");
  const aliceGroup = within(row).getByRole("group", { name: "Aliceのスコア" });
  await user.click(within(aliceGroup).getByRole("button", { name: "1" }));
  await user.click(within(row).getByRole("button", { name: "結果を確定" }));
}

async function selectScore(
  user: ReturnType<typeof userEvent.setup>,
  entrantName: string,
  option: "DQ" | "0" | "1" | "2" | "3" | "W",
) {
  const group = screen.getByRole("group", { name: `${entrantName}のスコア` });
  await user.click(within(group).getByRole("button", { name: option }));
}

/**
 * WAの結果確定が、勝者側(WB)・敗者側(LA)の両方を同時に進行可能にする
 * 構成(ユーザーフィードバック: 複数のマッチが同時に進行開始になる
 * ケースの検証用)。対戦台を2つ設定し、WAの結果確定によりWB・LAの
 * どちらも(片方の枠はあらかじめ埋めておくことで)両方の枠が確定する。
 */
async function seedChainingPool() {
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
    tableNumbers: ["1", "2"],
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
      nextMatch: null,
      awayPeriods: [],
    });
  }
  await db.put(
    "matchCards",
    card({
      id: "wa",
      identifier: "WA",
      round: 1,
      bracketSide: "WINNERS",
      tableNumber: "1",
      entrant1Id: "e1",
      entrant2Id: "e2",
    }),
  );
  await db.put(
    "matchCards",
    card({
      id: "wb",
      identifier: "WB",
      round: 2,
      bracketSide: "WINNERS",
      entrant1Id: null,
      entrant2Id: "e3",
      entrant1SourceMatchId: "wa",
    }),
  );
  await db.put(
    "matchCards",
    card({
      id: "la",
      identifier: "LA",
      round: -1,
      bracketSide: "LOSERS",
      entrant1Id: "e4",
      entrant2Id: null,
      entrant2SourceMatchId: "wa",
    }),
  );
}

async function seedEmptyPool() {
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
    bracketType: "ROUND_ROBIN",
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
    tableNumbers: [],
  });
}

describe("Next-match suggestion modal (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("shows the next-match suggestion for the freed table immediately after confirming a result (FR-017/FR-022)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();
  });

  it("starts the suggested match as IN_PROGRESS without a table number when none is entered (Acceptance Scenario 7)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "対戦開始" }));

    const db = await getDb();
    const suggested = await db.get("matchCards", "card-2");
    expect(suggested?.status).toBe("IN_PROGRESS");
    expect(suggested?.tableNumber).toBeNull();
  });

  it("disables an already-occupied table option in the modal's table select and shows which match is using it", async () => {
    await seedPool(["1", "2", "3"]);
    const db = await getDb();
    // card-3をあらかじめ対戦台3で進行中にしておく。
    const card3 = await db.get("matchCards", "card-3");
    await db.put("matchCards", {
      ...card3,
      tableNumber: "3",
      status: "IN_PROGRESS",
    });

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    const select = within(modal).getByLabelText("次戦の対戦台");
    const occupiedOption = within(select).getByRole("option", {
      name: "3(進行中: R1-3)",
    }) as HTMLOptionElement;
    expect(occupiedOption.disabled).toBe(true);
    const freeOption = within(select).getByRole("option", {
      name: "2",
    }) as HTMLOptionElement;
    expect(freeOption.disabled).toBe(false);
  });

  it("leaves the match unchanged when the modal is closed without a selection (FR-025)", async () => {
    await seedPool(["1", "2", "3"]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();

    const db = await getDb();
    const card2 = await db.get("matchCards", "card-2");
    expect(card2?.status).toBe("NOT_STARTED");
  });

  it("falls back to a single pool-wide suggestion when the pool has no table count set (FR-018)", async () => {
    await seedPool([]);
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await completeCard1(user);

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    // tableNumbers未設定なので対戦台選択は表示されない。
    expect(
      within(modal).queryByLabelText("次戦の対戦台"),
    ).not.toBeInTheDocument();
    expect(within(modal).getByText("R1-2")).toBeInTheDocument();
  });

  it("identifies the next-match candidate on the bracket board without opening the modal (FR-026)", async () => {
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
      tableNumbers: [],
    });
    for (const [id, name] of [
      ["e1", "Alice"],
      ["e2", "Bob"],
    ]) {
      await db.put("entrants", {
        id,
        poolId: "pool-1",
        name,
        attendance: "UNKNOWN",
        attendanceRecordedAt: null,
        poolFinished: false,
        nextMatch: null,
        awayPeriods: [],
      });
    }
    await db.put(
      "matchCards",
      card({
        id: "card-1",
        identifier: "WF",
        entrant1Id: "e1",
        entrant2Id: "e2",
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);

    const identifier = await screen.findByText("WF");
    const bracketCard = identifier.closest("li");
    expect(bracketCard).not.toBeNull();
    expect(bracketCard?.className).toContain("match-card-next");
    // モーダルは結果確定直後にのみ表示され、単に画面を開いただけでは出ない。
    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();
  });

  it("shows every newly-startable match one at a time, advancing only when '対戦開始' is pressed", async () => {
    await seedChainingPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    const waCard = (await screen.findByText("WA")).closest("li");
    if (!waCard) throw new Error("WA card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダルが開く。
    await user.click(waCard);
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    // WAの結果確定により、勝者側のWBと敗者側のLAが同時に進行可能になる。
    let modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    let modal = modalHeading.closest(".app-modal") as HTMLElement;
    const firstIdentifier = within(modal).getByText(/^(WB|LA)$/).textContent;
    expect(["WB", "LA"]).toContain(firstIdentifier);

    await user.click(within(modal).getByRole("button", { name: "対戦開始" }));

    // 「対戦開始」を押した場合のみ、残っているもう一方の候補が続けて
    // 表示される。
    modalHeading = await screen.findByRole("heading", { name: "次戦候補" });
    modal = modalHeading.closest(".app-modal") as HTMLElement;
    const secondIdentifier = within(modal).getByText(/^(WB|LA)$/).textContent;
    expect(secondIdentifier).not.toBe(firstIdentifier);
    expect(["WB", "LA"]).toContain(secondIdentifier);

    await user.click(within(modal).getByRole("button", { name: "対戦開始" }));

    // 2件とも開始済みになったので、もうモーダルは表示されない。
    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();

    const db = await getDb();
    const wb = await db.get("matchCards", "wb");
    const la = await db.get("matchCards", "la");
    expect(wb?.status).toBe("IN_PROGRESS");
    expect(la?.status).toBe("IN_PROGRESS");
  });

  it("resets the table-number select back to 未設定 when chaining to the next suggestion (does not keep the previous match's selection)", async () => {
    await seedChainingPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    const waCard = (await screen.findByText("WA")).closest("li");
    if (!waCard) throw new Error("WA card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダルが開く。
    await user.click(waCard);
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    let modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    let modal = modalHeading.closest(".app-modal") as HTMLElement;
    const firstSelect = within(modal).getByLabelText(
      "次戦の対戦台",
    ) as HTMLSelectElement;
    await user.selectOptions(firstSelect, "2");
    expect(firstSelect.value).toBe("2");

    await user.click(within(modal).getByRole("button", { name: "対戦開始" }));

    // 次の候補のモーダルでは、直前の対戦台選択が残らず「未設定」に
    // リセットされていること(本来選べないはずの、直前の対戦に対して
    // 選んだ対戦台が選択されたままになってはならない)。
    modalHeading = await screen.findByRole("heading", { name: "次戦候補" });
    modal = modalHeading.closest(".app-modal") as HTMLElement;
    const secondSelect = within(modal).getByLabelText(
      "次戦の対戦台",
    ) as HTMLSelectElement;
    expect(secondSelect.value).toBe("");
  });

  it("does not auto-chain to the remaining suggestion when the modal is closed instead of started", async () => {
    await seedChainingPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    const waCard = (await screen.findByText("WA")).closest("li");
    if (!waCard) throw new Error("WA card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダルが開く。
    await user.click(waCard);
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    const modalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const modal = modalHeading.closest(".app-modal") as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "閉じる" }));

    // 閉じただけでは、残りの候補があっても自動では再表示されない。
    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();

    // ただし候補自体は残っているため、ツールバーの「次戦候補」ボタンは
    // 有効なまま。
    expect(screen.getByRole("button", { name: "次戦候補" })).not.toBeDisabled();
  });

  it("reopens the modal for remaining suggestions via the '次戦候補' toolbar button", async () => {
    await seedChainingPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    const waCard = (await screen.findByText("WA")).closest("li");
    if (!waCard) throw new Error("WA card not found");
    // カード自体には操作可能な要素がなく、カード全体のタップで編集
    // モーダルが開く。
    await user.click(waCard);
    await selectScore(user, "Alice", "1");
    await user.click(screen.getByRole("button", { name: "結果を確定" }));

    const firstModalHeading = await screen.findByRole("heading", {
      name: "次戦候補",
    });
    const firstModal = firstModalHeading.closest(".app-modal") as HTMLElement;
    await user.click(
      within(firstModal).getByRole("button", { name: "閉じる" }),
    );
    expect(
      screen.queryByRole("heading", { name: "次戦候補" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "次戦候補" }));
    expect(
      await screen.findByRole("heading", { name: "次戦候補" }),
    ).toBeInTheDocument();
  });

  it("disables the '次戦候補' toolbar button when there are no pending suggestions", async () => {
    await seedEmptyPool();
    const user = userEvent.setup();
    render(<App />);
    await acknowledgeNotice(user);
    await screen.findByText("対戦カードがまだありません。");

    expect(screen.getByRole("button", { name: "次戦候補" })).toBeDisabled();
  });
});
