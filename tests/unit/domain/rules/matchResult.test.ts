import { describe, expect, it } from "vitest";
import {
  type MatchResultInput,
  resolveMatchResult,
} from "../../../../src/domain/rules/matchResult.js";

function baseInput(overrides: Partial<MatchResultInput>): MatchResultInput {
  return {
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    entrant1W: false,
    entrant2W: false,
    ...overrides,
  };
}

describe("resolveMatchResult", () => {
  it("declares the higher score the winner", () => {
    const outcome = resolveMatchResult(
      baseInput({ entrant1Score: 3, entrant2Score: 1 }),
    );
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "3-1" });
  });

  it("treats the unfilled side as 0", () => {
    const outcome = resolveMatchResult(baseInput({ entrant1Score: 3 }));
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "3-0" });
  });

  it("declares the other entrant the winner on DQ, without requiring a score", () => {
    const outcome = resolveMatchResult(baseInput({ entrant2DQ: true }));
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "0-DQ" });
  });

  it("rejects a tie", () => {
    const outcome = resolveMatchResult(
      baseInput({ entrant1Score: 2, entrant2Score: 2 }),
    );
    expect(outcome).toEqual({ error: "TIE" });
  });

  it("rejects both entrants being DQ'd simultaneously", () => {
    const outcome = resolveMatchResult(
      baseInput({ entrant1DQ: true, entrant2DQ: true }),
    );
    expect(outcome).toEqual({ error: "BOTH_DQ" });
  });

  it("declares the W side the winner without requiring a score, auto-filling the other side as 0", () => {
    const outcome = resolveMatchResult(baseInput({ entrant1W: true }));
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "W-0" });
  });

  it("declares the W side the winner regardless of which slot it is in", () => {
    const outcome = resolveMatchResult(baseInput({ entrant2W: true }));
    expect(outcome).toEqual({ winnerSlot: "entrant2", score: "0-W" });
  });

  it("rejects both entrants being marked W simultaneously", () => {
    const outcome = resolveMatchResult(
      baseInput({ entrant1W: true, entrant2W: true }),
    );
    expect(outcome).toEqual({ error: "BOTH_W" });
  });

  it("does not treat W on one side and DQ on the other as a conflict (both indicate the same winner)", () => {
    const outcome = resolveMatchResult(
      baseInput({ entrant1W: true, entrant2DQ: true }),
    );
    expect(outcome).toEqual({ winnerSlot: "entrant1", score: "W-DQ" });
  });
});
