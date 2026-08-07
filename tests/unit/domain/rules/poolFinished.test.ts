import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computePoolFinished } from "../../../../src/domain/rules/poolFinished.js";

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
    ...overrides,
  };
}

describe("computePoolFinished", () => {
  it("returns false when the entrant has no match cards", () => {
    expect(computePoolFinished("e1", [])).toBe(false);
  });

  it("returns false when at least one card involving the entrant is unfinished", () => {
    const cards = [
      makeCard({
        id: "c1",
        entrant1Id: "e1",
        entrant2Id: "e2",
        status: "COMPLETED",
      }),
      makeCard({
        id: "c2",
        entrant1Id: "e1",
        entrant2Id: "e3",
        status: "NOT_STARTED",
      }),
    ];
    expect(computePoolFinished("e1", cards)).toBe(false);
  });

  it("returns true when every card involving the entrant is completed", () => {
    const cards = [
      makeCard({
        id: "c1",
        entrant1Id: "e1",
        entrant2Id: "e2",
        status: "COMPLETED",
      }),
      makeCard({
        id: "c2",
        entrant2Id: "e1",
        entrant1Id: "e3",
        status: "COMPLETED",
      }),
      makeCard({
        id: "c3",
        entrant1Id: "e2",
        entrant2Id: "e3",
        status: "NOT_STARTED",
      }),
    ];
    expect(computePoolFinished("e1", cards)).toBe(true);
  });
});
