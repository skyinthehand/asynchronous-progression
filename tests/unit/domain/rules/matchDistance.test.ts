import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeMatchDistances } from "../../../../src/domain/rules/matchDistance.js";

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
    entrant1W: false,
    entrant2W: false,
    skippedFromSuggestion: false,
    ...overrides,
  };
}

describe("computeMatchDistances", () => {
  it("assigns distance 1 to each side's pool-exit match and increments going backward (spec.md WF/LSF/WSF/LQF example)", () => {
    const cards = [
      makeCard({
        id: "wsf",
        identifier: "WSF",
        round: 1,
        bracketSide: "WINNERS",
      }),
      makeCard({
        id: "wf",
        identifier: "WF",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "wsf",
      }),
      makeCard({
        id: "lqf",
        identifier: "LQF",
        round: 1,
        bracketSide: "LOSERS",
      }),
      makeCard({
        id: "lsf",
        identifier: "LSF",
        round: 2,
        bracketSide: "LOSERS",
        entrant1SourceMatchId: "lqf",
      }),
    ];
    const distances = computeMatchDistances(cards);
    expect(distances.get("wf")).toBe(1);
    expect(distances.get("lsf")).toBe(1);
    expect(distances.get("wsf")).toBe(2);
    expect(distances.get("lqf")).toBe(2);
  });

  it("takes the nearer of two destinations when a match's winner and loser paths differ in length (cross-side loser-drop edge)", () => {
    const cards = [
      makeCard({
        id: "w1",
        identifier: "W1",
        round: 1,
        bracketSide: "WINNERS",
      }),
      makeCard({
        id: "wf",
        identifier: "WF",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "w1",
      }),
      // w1の敗者がl1に落ちる(w1がl1のentrant2Sourceになる、勝者はwfへ)。
      makeCard({
        id: "l1",
        identifier: "L1",
        round: 1,
        bracketSide: "LOSERS",
        entrant2SourceMatchId: "w1",
      }),
      makeCard({
        id: "lf",
        identifier: "LF",
        round: 2,
        bracketSide: "LOSERS",
        entrant1SourceMatchId: "l1",
      }),
    ];
    const distances = computeMatchDistances(cards);
    // w1からの2経路: wf(距離1)経由で距離2、l1(距離2)経由で距離3。近い方の2が採用される。
    expect(distances.get("wf")).toBe(1);
    expect(distances.get("lf")).toBe(1);
    expect(distances.get("w1")).toBe(2);
    expect(distances.get("l1")).toBe(2);
  });

  it("returns an empty map for round-robin pools (no WINNERS/LOSERS bracketSide present)", () => {
    const cards = [
      makeCard({ id: "a", bracketSide: "N/A" }),
      makeCard({ id: "b", bracketSide: "N/A" }),
    ];
    expect(computeMatchDistances(cards)).toEqual(new Map());
  });

  it("computes distances using only the WINNERS side when no LOSERS cards exist (single elimination)", () => {
    const cards = [
      makeCard({
        id: "r1",
        identifier: "R1",
        round: 1,
        bracketSide: "WINNERS",
      }),
      makeCard({
        id: "r2",
        identifier: "R2",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "r1",
      }),
      makeCard({
        id: "final",
        identifier: "F",
        round: 3,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "r2",
      }),
    ];
    const distances = computeMatchDistances(cards);
    expect(distances.get("final")).toBe(1);
    expect(distances.get("r2")).toBe(2);
    expect(distances.get("r1")).toBe(3);
  });
});
