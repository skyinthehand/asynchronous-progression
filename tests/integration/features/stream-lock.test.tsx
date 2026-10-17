import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/app/App.js";
import type { MatchCard } from "../../../src/domain/entities/matchCard.js";
import { SINGLETON_KEY, getDb } from "../../../src/infra/storage/db.js";

vi.mock("../../../src/infra/startgg/operations.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/infra/startgg/operations.js")
    >();
  return {
    ...actual,
    fetchEventRules: vi.fn().mockRejectedValue(new Error("offline")),
    fetchPoolDetail: vi.fn(),
  };
});

const operations = await import("../../../src/infra/startgg/operations.js");

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

function makeCard(overrides: Partial<MatchCard> & { id: string }): MatchCard {
  return {
    poolId: "pool-1",
    identifier: "A",
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
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    entrant1W: false,
    entrant2W: false,
    statusLocalOnly: false,
    isStreamed: false,
    ...overrides,
  };
}

/**
 * 005-stream-match-lock: 組合せ図形式(SINGLE_ELIMINATION/DOUBLE_ELIMINATION、
 * MatchCardEntry.tsx)・総当り/OTHER形式の表(MatchCardRow.tsx)のいずれでも
 * 検証できるよう、`bracketType`を切り替えられるseedヘルパー。
 */
async function seedPool(
  bracketType: "SINGLE_ELIMINATION" | "OTHER",
  cards: MatchCard[],
) {
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
    bracketType,
    staffName: null,
    lastSyncedAt: null,
    onboardingCompletedAt: new Date().toISOString(),
    tableNumbers: ["1"],
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
      seed: null,
      nextMatch: null,
      awayPeriods: [],
    });
  }
  for (const card of cards) {
    await db.put("matchCards", card);
  }
}

describe("Stream lock (005-stream-match-lock)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.mocked(operations.fetchPoolDetail).mockReset();
  });

  describe("US1: a streamed match cannot be edited", () => {
    it("does not open the edit modal for a not-started streamed card (bracket board)", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      const card = (await screen.findByText("A")).closest("li");
      if (!card) throw new Error("card not found");
      await user.click(card);
      expect(screen.queryByText("Aの編集")).not.toBeInTheDocument();

      // FR-005: 非表示・除外にはしない。一覧に表示され続ける。
      expect(within(card).getByText("Alice")).toBeInTheDocument();
      expect(within(card).getByText("Bob")).toBeInTheDocument();
    });

    it("does not show the '進行中にする' button, table select, or score entry for a not-started streamed card (table/OTHER format)", async () => {
      await seedPool("OTHER", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText("A");
      expect(
        screen.queryByRole("button", { name: "進行中にする" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Aの対戦台")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("group", { name: "Aliceのスコア" }),
      ).not.toBeInTheDocument();
    });

    it("still allows editing a non-streamed card (bracket board)", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: false }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      const card = (await screen.findByText("A")).closest("li");
      if (!card) throw new Error("card not found");
      await user.click(card);
      expect(
        await screen.findByRole("heading", { name: "Aの編集" }),
      ).toBeInTheDocument();
    });

    it("still allows editing a non-streamed card (table/OTHER format)", async () => {
      await seedPool("OTHER", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: false }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText("A");
      expect(
        screen.getByRole("button", { name: "進行中にする" }),
      ).toBeInTheDocument();
    });

    it("excludes a streamed, otherwise-eligible card from next-match suggestions", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText("A");
      expect(
        screen.queryByRole("button", { name: "卓を選んで呼び出す" }),
      ).not.toBeInTheDocument();
    });

    it("still reflects a start.gg-confirmed result for a streamed card via sync (FR-009)", async () => {
      await seedPool("OTHER", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
        poolId: "pool-1",
        displayIdentifier: "Pool 1",
        bracketType: "OTHER",
        matchCards: [
          makeCard({
            id: "card-1",
            identifier: "A",
            isStreamed: true,
            status: "COMPLETED",
            winnerId: "e1",
            score: "2-0",
          }),
        ],
        entrants: [],
      });

      const { runSync } = await import(
        "../../../src/features/sync/syncRunner.js"
      );
      await runSync();

      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      expect(await screen.findByText(/勝者: Alice/)).toBeInTheDocument();
    });

    it("blocks correcting a completed, unlocked, streamed card (bracket board)", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({
          id: "card-1",
          identifier: "A",
          isStreamed: true,
          status: "COMPLETED",
          winnerId: "e1",
          score: "2-0",
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      const card = (await screen.findByText("A")).closest("li");
      if (!card) throw new Error("card not found");
      expect(card.getAttribute("role")).toBeNull();
      await user.click(card);
      expect(screen.queryByText("Aの編集")).not.toBeInTheDocument();
    });

    it("blocks correcting a completed, unlocked, streamed card (table/OTHER format)", async () => {
      await seedPool("OTHER", [
        makeCard({
          id: "card-1",
          identifier: "A",
          isStreamed: true,
          status: "COMPLETED",
          winnerId: "e1",
          score: "2-0",
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText(/勝者: Alice/);
      expect(
        screen.queryByRole("button", { name: "結果を修正" }),
      ).not.toBeInTheDocument();
    });

    it("still allows correcting a completed, unlocked, non-streamed card (control, both formats)", async () => {
      await seedPool("OTHER", [
        makeCard({
          id: "card-1",
          identifier: "A",
          isStreamed: false,
          status: "COMPLETED",
          winnerId: "e1",
          score: "2-0",
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText(/勝者: Alice/);
      expect(
        screen.getByRole("button", { name: "結果を修正" }),
      ).toBeInTheDocument();
    });
  });

  describe("US2: streamed matches are visually distinguishable", () => {
    it("shows a '配信予定' badge on a not-started streamed card, distinct from the locked-for-correction note", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
        makeCard({
          id: "card-2",
          identifier: "B",
          entrant1Id: null,
          entrant2Id: null,
          status: "COMPLETED",
          winnerId: null,
          isLocked: true,
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      const streamedCard = (await screen.findByText("A")).closest("li");
      if (!streamedCard) throw new Error("card A not found");
      expect(within(streamedCard).getByText("配信予定")).toBeInTheDocument();

      const lockedCard = (await screen.findByText("B")).closest("li");
      if (!lockedCard) throw new Error("card B not found");
      expect(
        within(lockedCard).queryByText("配信予定"),
      ).not.toBeInTheDocument();
      expect(within(lockedCard).queryByText("配信中")).not.toBeInTheDocument();

      // artifact更新(2026-10-17): 修正不可の注意書きは鍵マーク(クリックで
      // 開閉するツールチップ)で示す。
      await user.click(
        within(lockedCard).getByRole("button", {
          name: "結果は確定済み（修正不可）。理由を表示",
        }),
      );
      expect(
        within(lockedCard).getByText(/後続の対戦が進行しているため/),
      ).toBeInTheDocument();
    });

    it("shows '配信予定' before the match starts and switches to '配信中' once it is in progress (005-stream-match-lock follow-up, 2026-10-16)", async () => {
      await seedPool("OTHER", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      const user = userEvent.setup();
      const { unmount } = render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText("配信予定");
      expect(screen.queryByText("配信中")).not.toBeInTheDocument();

      // start.ggで対戦が開始された状態を、次回の定期同期として再現する。
      unmount();
      vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
        poolId: "pool-1",
        displayIdentifier: "Pool 1",
        bracketType: "OTHER",
        matchCards: [
          makeCard({
            id: "card-1",
            identifier: "A",
            isStreamed: true,
            status: "IN_PROGRESS",
          }),
        ],
        entrants: [],
      });
      const { runSync } = await import(
        "../../../src/features/sync/syncRunner.js"
      );
      await runSync();

      const user2 = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user2);

      await screen.findByText("配信中");
      expect(screen.queryByText("配信予定")).not.toBeInTheDocument();
    });

    it("shows the '配信中' badge on a streamed card regardless of status (bracket board)", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({
          id: "card-1",
          identifier: "A",
          isStreamed: true,
          status: "COMPLETED",
          winnerId: "e1",
          score: "2-0",
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      const card = (await screen.findByText("A")).closest("li");
      if (!card) throw new Error("card not found");
      expect(within(card).getByText("配信中")).toBeInTheDocument();
    });

    it("shows the '配信中' badge on a streamed card regardless of status (table/OTHER format)", async () => {
      await seedPool("OTHER", [
        makeCard({
          id: "card-1",
          identifier: "A",
          isStreamed: true,
          status: "COMPLETED",
          winnerId: "e1",
          score: "2-0",
        }),
      ]);
      const user = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user);

      await screen.findByText(/勝者: Alice/);
      expect(screen.getByText("配信中")).toBeInTheDocument();
    });

    it("clears the badge and re-enables editing once start.gg reports the stream was unassigned (FR-008)", async () => {
      await seedPool("SINGLE_ELIMINATION", [
        makeCard({ id: "card-1", identifier: "A", isStreamed: true }),
      ]);
      const user = userEvent.setup();
      const { unmount } = render(<App />);
      await acknowledgeNotice(user);

      const before = (await screen.findByText("A")).closest("li");
      if (!before) throw new Error("card not found");
      expect(within(before).getByText("配信予定")).toBeInTheDocument();
      expect(before.getAttribute("role")).toBeNull();

      // start.gg側で配信台の設定が解除された状態を、次回の定期同期として
      // 再現する(このアプリはバックグラウンド同期の完了を既に開いている
      // 画面へ即座に反映する仕組みを持たないため、001-pool-progression-
      // trackerの既存テストと同じ「端末の再起動を模す」パターンを使う)。
      unmount();
      vi.mocked(operations.fetchPoolDetail).mockResolvedValue({
        poolId: "pool-1",
        displayIdentifier: "Pool 1",
        bracketType: "SINGLE_ELIMINATION",
        matchCards: [
          makeCard({ id: "card-1", identifier: "A", isStreamed: false }),
        ],
        entrants: [],
      });
      const { runSync } = await import(
        "../../../src/features/sync/syncRunner.js"
      );
      await runSync();

      const user2 = userEvent.setup();
      render(<App />);
      await acknowledgeNotice(user2);

      const after = (await screen.findByText("A")).closest("li");
      if (!after) throw new Error("card not found");
      expect(within(after).queryByText("配信予定")).not.toBeInTheDocument();
      await user2.click(after);
      expect(
        await screen.findByRole("heading", { name: "Aの編集" }),
      ).toBeInTheDocument();
    });
  });
});
