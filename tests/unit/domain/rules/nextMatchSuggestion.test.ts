import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeNextMatchSuggestions } from "../../../../src/domain/rules/nextMatchSuggestion.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
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
    skippedFromSuggestion: false,
    ...overrides,
  };
}

describe("computeNextMatchSuggestions", () => {
  it("returns a single pool-wide suggestion (round then identifier order) when tableCount is unset", () => {
    const cards = [
      makeCard({ id: "a", round: 2, identifier: "R2-1" }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
      makeCard({ id: "c", round: 1, identifier: "R1-1" }),
    ];
    expect(computeNextMatchSuggestions(cards, null)).toEqual([
      { matchCardId: "c", table: null },
    ]);
  });

  it("returns nothing when there are no NOT_STARTED cards", () => {
    const cards = [makeCard({ id: "a", status: "COMPLETED" })];
    expect(computeNextMatchSuggestions(cards, null)).toEqual([]);
  });

  it("assigns one suggestion per empty table when tableCount is set", () => {
    const cards = [
      makeCard({ id: "a", round: 1, identifier: "R1-1" }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
    ];
    const result = computeNextMatchSuggestions(cards, 2);
    expect(result).toEqual([
      { matchCardId: "a", table: "1" },
      { matchCardId: "b", table: "2" },
    ]);
  });

  it("does not suggest a table that already has an incomplete card assigned", () => {
    const cards = [
      makeCard({
        id: "a",
        round: 1,
        identifier: "R1-1",
        tableNumber: "1",
        status: "IN_PROGRESS",
      }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
    ];
    const result = computeNextMatchSuggestions(cards, 2);
    expect(result).toEqual([{ matchCardId: "b", table: "2" }]);
  });

  it("does not suggest the same match twice for two different empty tables", () => {
    const cards = [makeCard({ id: "a", round: 1, identifier: "R1-1" })];
    const result = computeNextMatchSuggestions(cards, 2);
    expect(result).toEqual([{ matchCardId: "a", table: "1" }]);
  });

  it("deprioritizes skipped cards but still offers them when nothing else is available", () => {
    const cards = [
      makeCard({
        id: "a",
        round: 1,
        identifier: "R1-1",
        skippedFromSuggestion: true,
      }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
    ];
    // 1台のみ: スキップされていないbが優先される。
    expect(computeNextMatchSuggestions(cards, 1)).toEqual([
      { matchCardId: "b", table: "1" },
    ]);

    const onlySkipped = [
      makeCard({
        id: "a",
        round: 1,
        identifier: "R1-1",
        skippedFromSuggestion: true,
      }),
    ];
    // 残りが全てスキップ済みなら、それを提示する(完全除外はしない)。
    expect(computeNextMatchSuggestions(onlySkipped, 1)).toEqual([
      { matchCardId: "a", table: "1" },
    ]);
  });
});
