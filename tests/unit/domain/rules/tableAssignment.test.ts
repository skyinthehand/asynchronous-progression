import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { isTableOccupied } from "../../../../src/domain/rules/tableAssignment.js";

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
    skippedFromSuggestion: false,
    ...overrides,
  };
}

describe("isTableOccupied", () => {
  it("treats a table with an incomplete card assigned as occupied", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "NOT_STARTED" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(true);
  });

  it("does not treat a table with only a completed card assigned as occupied", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "COMPLETED" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(false);
  });

  it("treats IN_PROGRESS the same as NOT_STARTED (occupied)", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "IN_PROGRESS" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(true);
  });

  it("excludes the card being reassigned itself from the occupancy check", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "1", status: "NOT_STARTED" }),
    ];
    expect(isTableOccupied("1", cards, "a")).toBe(false);
  });

  it("returns false when no card uses the table", () => {
    const cards = [
      makeCard({ id: "a", tableNumber: "2", status: "NOT_STARTED" }),
    ];
    expect(isTableOccupied("1", cards)).toBe(false);
  });
});
