import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { advanceWinner } from "../../../../src/domain/rules/matchProgression.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
  return {
    id: "card",
    poolId: "pool-1",
    identifier: "R1-1",
    round: 1,
    bracketSide: "WINNERS",
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
    ...overrides,
  };
}

describe("advanceWinner", () => {
  it("fills the downstream card's entrant1Id when it sources from the completed card", () => {
    const w1 = makeCard({ id: "w1", entrant1Id: "e1", entrant2Id: "e2" });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: "w2",
    });

    const [, updated] = advanceWinner([w1, w3], "w1", "e1");

    expect(updated.entrant1Id).toBe("e1");
    expect(updated.entrant2Id).toBeNull();
  });

  it("fills entrant2Id when the downstream card sources it from the completed card", () => {
    const w2 = makeCard({ id: "w2", entrant1Id: "e3", entrant2Id: "e4" });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: "w2",
    });

    const [, updated] = advanceWinner([w2, w3], "w2", "e3");

    expect(updated.entrant2Id).toBe("e3");
  });

  it("overwrites a previously advanced entrant when the source result is corrected", () => {
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1Id: "e1",
      entrant1SourceMatchId: "w1",
    });

    const [updated] = advanceWinner([w3], "w1", "e2");

    expect(updated.entrant1Id).toBe("e2");
  });

  it("does not touch cards unrelated to the completed match", () => {
    const other = makeCard({ id: "other", entrant1SourceMatchId: "unrelated" });

    const [updated] = advanceWinner([other], "w1", "e1");

    expect(updated).toBe(other);
  });
});
