import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { isStreamLocked } from "../../../../src/domain/rules/streamLock.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
  return {
    id: "card",
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

describe("isStreamLocked", () => {
  it("returns true when isStreamed is true", () => {
    expect(isStreamLocked(makeCard({ isStreamed: true }))).toBe(true);
  });

  it("returns false when isStreamed is false (default)", () => {
    expect(isStreamLocked(makeCard({}))).toBe(false);
  });

  it("does not depend on status: true for isStreamed regardless of NOT_STARTED/IN_PROGRESS/COMPLETED", () => {
    for (const status of ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(isStreamLocked(makeCard({ isStreamed: true, status }))).toBe(true);
    }
  });

  it("does not depend on status: false for isStreamed regardless of NOT_STARTED/IN_PROGRESS/COMPLETED", () => {
    for (const status of ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(isStreamLocked(makeCard({ isStreamed: false, status }))).toBe(
        false,
      );
    }
  });
});
