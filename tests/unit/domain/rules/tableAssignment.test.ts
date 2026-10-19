import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import {
  findOccupyingMatchCard,
  isTableOccupied,
} from "../../../../src/domain/rules/tableAssignment.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
  return {
    id: "card",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "N/A",
    tableNumber: null,
    entrant1Id: null,
    entrant2Id: null,
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
    ...overrides,
  };
}

describe("isTableOccupied", () => {
  /**
   * ユーザーフィードバック(2026-10-19): 対戦台をプールに割り当てられた
   * 全ての対戦台から選べるようにしてほしい(対戦者が未確定の段階でも
   * 事前に対戦台を割り当てられるようになったため、NOT_STARTEDの対戦
   * カード同士で同じ対戦台番号が重複していても「占有中」とは扱わない)。
   * 占有中として実際に選択をブロックするのは、本当にその卓を使って対戦が
   * 進行中(IN_PROGRESS)の場合のみ。
   */
  it("does not treat a table with only a not-started card assigned as occupied", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "NOT_STARTED" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(false);
  });

  it("does not treat a table with only a completed card assigned as occupied", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "COMPLETED" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(false);
  });

  it("treats a table with an in-progress card assigned as occupied", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "IN_PROGRESS" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(true);
  });

  it("excludes the card being reassigned itself from the occupancy check", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "IN_PROGRESS" }),
    ];
    expect(isTableOccupied("1", cards, "a")).toBe(false);
  });

  it("returns false when no card uses the table", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "2", status: "IN_PROGRESS" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(false);
  });
});

describe("findOccupyingMatchCard", () => {
  it("returns the in-progress card assigned to the table", () => {
    const cards = [
      makeCard({
        id: "a",
        identifier: "R1-1",
        tableNumber: "1",
        status: "IN_PROGRESS",
      }),
    ];
    expect(findOccupyingMatchCard("1", cards)?.id).toBe("a");
  });

  it("returns null when the only card on the table is not started", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "NOT_STARTED" }),
    ];
    expect(findOccupyingMatchCard("1", cards)).toBeNull();
  });

  it("returns null when the only card on the table is completed", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "COMPLETED" }),
    ];
    expect(findOccupyingMatchCard("1", cards)).toBeNull();
  });

  it("excludes the card being reassigned itself", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "IN_PROGRESS" }),
    ];
    expect(findOccupyingMatchCard("1", cards, "a")).toBeNull();
  });

  it("returns null when no card uses the table", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "2", status: "IN_PROGRESS" }),
    ];
    expect(findOccupyingMatchCard("1", cards)).toBeNull();
  });
});
