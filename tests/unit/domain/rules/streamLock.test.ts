import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import {
  isStreamLocked,
  streamBadgeLabel,
} from "../../../../src/domain/rules/streamLock.js";

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

/**
 * ユーザーフィードバック(2026-10-16): 配信(stream)が割り当てられていても
 * 対戦自体はまだ始まっていないことがあるため、未着手(NOT_STARTED)の間は
 * 「配信予定」、進行中(IN_PROGRESS)は「配信中」と出し分け、確定済み
 * (COMPLETED)は表示しない(2026-10-20)。
 */
describe("streamBadgeLabel", () => {
  it("returns null when isStreamed is false, regardless of status", () => {
    for (const status of ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(streamBadgeLabel(makeCard({ isStreamed: false, status }))).toBe(
        null,
      );
    }
  });

  it("returns '配信予定' when streamed but not yet started", () => {
    expect(
      streamBadgeLabel(makeCard({ isStreamed: true, status: "NOT_STARTED" })),
    ).toBe("配信予定");
  });

  it("returns '配信中' when streamed and in progress", () => {
    expect(
      streamBadgeLabel(makeCard({ isStreamed: true, status: "IN_PROGRESS" })),
    ).toBe("配信中");
  });

  it("returns null when streamed and completed (start.gg keeps the stream assigned after the result is reported)", () => {
    expect(
      streamBadgeLabel(makeCard({ isStreamed: true, status: "COMPLETED" })),
    ).toBe(null);
  });
});
