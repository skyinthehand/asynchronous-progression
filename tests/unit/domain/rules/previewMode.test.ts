import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeIsPreviewMode } from "../../../../src/domain/rules/previewMode.js";

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
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    entrant1W: false,
    entrant2W: false,
    ...overrides,
  };
}

describe("computeIsPreviewMode", () => {
  it("is false for an empty match card list", () => {
    expect(computeIsPreviewMode([])).toBe(false);
  });

  it("is false when every card has a real (non-preview) id", () => {
    const cards = [makeCard({ id: "5000" }), makeCard({ id: "5001" })];
    expect(computeIsPreviewMode(cards)).toBe(false);
  });

  it("is true when at least one card has a preview id, even if others are real", () => {
    const cards = [
      makeCard({ id: "5000" }),
      makeCard({ id: "preview_3068263_1_0" }),
    ];
    expect(computeIsPreviewMode(cards)).toBe(true);
  });
});
