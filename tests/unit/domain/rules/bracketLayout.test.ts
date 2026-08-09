import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeBracketLayout } from "../../../../src/domain/rules/bracketLayout.js";

function makeCard(overrides: Partial<MatchCard>): MatchCard {
  return {
    id: "card",
    poolId: "pool-1",
    identifier: "A",
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

describe("computeBracketLayout", () => {
  it("positions a round-2 match at the average slot of its two round-1 predecessors and connects them", () => {
    const r1a = makeCard({ id: "r1a", identifier: "A", round: 1 });
    const r1b = makeCard({ id: "r1b", identifier: "B", round: 1 });
    const r2 = makeCard({
      id: "r2",
      identifier: "C",
      round: 2,
      entrant1SourceMatchId: "r1a",
      entrant2SourceMatchId: "r1b",
    });

    const [winners] = computeBracketLayout([r1a, r1b, r2]);

    expect(winners.side).toBe("WINNERS");
    expect(winners.rounds).toEqual([1, 2]);
    expect(winners.matchesByRound.get(1)).toEqual([
      { card: r1a, round: 1, slot: 0 },
      { card: r1b, round: 1, slot: 1 },
    ]);
    expect(winners.matchesByRound.get(2)).toEqual([
      { card: r2, round: 2, slot: 0.5 },
    ]);
    expect(winners.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromMatchId: "r1a",
          fromRoundIndex: 0,
          fromSlot: 0,
          toMatchId: "r2",
          toRoundIndex: 1,
          toSlot: 0.5,
        }),
        expect.objectContaining({
          fromMatchId: "r1b",
          fromRoundIndex: 0,
          fromSlot: 1,
          toMatchId: "r2",
          toRoundIndex: 1,
          toSlot: 0.5,
        }),
      ]),
    );
    expect(winners.connectors).toHaveLength(2);
  });

  it("records a cross-side origin (winners loser drops to losers bracket) instead of a connector", () => {
    const w1a = makeCard({ id: "w1a", identifier: "A", round: 1 });
    const w1b = makeCard({ id: "w1b", identifier: "B", round: 1 });
    const l1 = makeCard({
      id: "l1",
      identifier: "loser-of-a-b",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "w1a",
      entrant2SourceMatchId: "w1b",
    });

    const [, losers] = computeBracketLayout([w1a, w1b, l1]);

    expect(losers.side).toBe("LOSERS");
    expect(losers.connectors).toHaveLength(0);
    expect(losers.crossSideOrigins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toMatchId: "l1",
          fromMatchId: "w1a",
          fromIdentifier: "A",
          fromSide: "WINNERS",
        }),
        expect.objectContaining({
          toMatchId: "l1",
          fromMatchId: "w1b",
          fromIdentifier: "B",
          fromSide: "WINNERS",
        }),
      ]),
    );
  });

  it("falls back to sequential slots when predecessor data is unavailable", () => {
    const r2a = makeCard({ id: "r2a", identifier: "A", round: 2 });
    const r2b = makeCard({ id: "r2b", identifier: "B", round: 2 });

    const [winners] = computeBracketLayout([r2a, r2b]);

    expect(winners.matchesByRound.get(2)).toEqual([
      { card: r2a, round: 2, slot: 0 },
      { card: r2b, round: 2, slot: 1 },
    ]);
    expect(winners.connectors).toHaveLength(0);
  });

  it("returns an empty array when there are no elimination-bracket match cards", () => {
    expect(computeBracketLayout([])).toEqual([]);
  });
});
