import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeIsLocked } from "../../../../src/domain/rules/editLock.js";

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

describe("computeIsLocked", () => {
  it("is not locked when the card has no winner yet", () => {
    const card = makeCard({ id: "c1", winnerId: null });
    expect(computeIsLocked(card, [card])).toBe(false);
  });

  it("is not locked when no downstream card has started", () => {
    const c1 = makeCard({
      id: "c1",
      round: 1,
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      status: "COMPLETED",
    });
    const c2 = makeCard({
      id: "c2",
      round: 2,
      entrant1Id: "e1",
      entrant2Id: "e3",
      status: "NOT_STARTED",
    });
    expect(computeIsLocked(c1, [c1, c2])).toBe(false);
  });

  it("is locked once the downstream card involving the winner has progressed", () => {
    const c1 = makeCard({
      id: "c1",
      round: 1,
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      status: "COMPLETED",
    });
    const c2 = makeCard({
      id: "c2",
      round: 2,
      entrant1Id: "e1",
      entrant2Id: "e3",
      status: "COMPLETED",
    });
    expect(computeIsLocked(c1, [c1, c2])).toBe(true);
  });

  it("ignores cards at the same or an earlier round", () => {
    const c1 = makeCard({
      id: "c1",
      round: 2,
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      status: "COMPLETED",
    });
    const earlier = makeCard({
      id: "c0",
      round: 1,
      entrant1Id: "e1",
      entrant2Id: "e4",
      status: "COMPLETED",
    });
    expect(computeIsLocked(c1, [c1, earlier])).toBe(false);
  });
});
