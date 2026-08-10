import { describe, expect, it } from "vitest";
import { resolveMatchResult } from "../../../../src/domain/rules/matchResult.js";

describe("resolveMatchResult", () => {
  it("declares the higher score the winner", () => {
    const outcome = resolveMatchResult({
      entrant1Score: 3,
      entrant2Score: 1,
      entrant1DQ: false,
      entrant2DQ: false,
    });
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "3-1" });
  });

  it("treats the unfilled side as 0", () => {
    const outcome = resolveMatchResult({
      entrant1Score: 3,
      entrant2Score: null,
      entrant1DQ: false,
      entrant2DQ: false,
    });
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "3-0" });
  });

  it("declares the other entrant the winner on DQ, without requiring a score", () => {
    const outcome = resolveMatchResult({
      entrant1Score: null,
      entrant2Score: null,
      entrant1DQ: false,
      entrant2DQ: true,
    });
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "0-DQ" });
  });

  it("rejects a tie", () => {
    const outcome = resolveMatchResult({
      entrant1Score: 2,
      entrant2Score: 2,
      entrant1DQ: false,
      entrant2DQ: false,
    });
    expect(outcome).toEqual({ error: "TIE" });
  });

  it("rejects both entrants being DQ'd simultaneously", () => {
    const outcome = resolveMatchResult({
      entrant1Score: null,
      entrant2Score: null,
      entrant1DQ: true,
      entrant2DQ: true,
    });
    expect(outcome).toEqual({ error: "BOTH_DQ" });
  });
});
