import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import { computeNextMatchSuggestions } from "../../../../src/domain/rules/nextMatchSuggestion.js";

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
    ...overrides,
  };
}

describe("computeNextMatchSuggestions", () => {
  it("returns a single pool-wide suggestion (round then identifier order) when tableNumbers is empty", () => {
    const cards = [
      makeCard({ id: "a", round: 2, identifier: "R2-1" }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
      makeCard({ id: "c", round: 1, identifier: "R1-1" }),
    ];
    expect(computeNextMatchSuggestions(cards, [])).toEqual([
      { matchCardId: "c", table: null },
    ]);
  });

  it("returns nothing when there are no NOT_STARTED cards", () => {
    const cards = [makeCard({ id: "a", status: "COMPLETED" })];
    expect(computeNextMatchSuggestions(cards, [])).toEqual([]);
  });

  it("assigns one suggestion per empty table, using the venue's own (non-sequential) table numbers", () => {
    const cards = [
      makeCard({ id: "a", round: 1, identifier: "R1-1" }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
    ];
    const result = computeNextMatchSuggestions(cards, ["101", "102"]);
    expect(result).toEqual([
      { matchCardId: "a", table: "101" },
      { matchCardId: "b", table: "102" },
    ]);
  });

  it("does not suggest a table that already has an incomplete card assigned", () => {
    const cards = [
      makeCard({
        id: "a",
        round: 1,
        identifier: "R1-1",
        tableNumber: "1",
        status: "IN_PROGRESS",
      }),
      makeCard({ id: "b", round: 1, identifier: "R1-2" }),
    ];
    const result = computeNextMatchSuggestions(cards, ["1", "2"]);
    expect(result).toEqual([{ matchCardId: "b", table: "2" }]);
  });

  it("does not suggest the same match twice for two different empty tables", () => {
    const cards = [makeCard({ id: "a", round: 1, identifier: "R1-1" })];
    const result = computeNextMatchSuggestions(cards, ["1", "2"]);
    expect(result).toEqual([{ matchCardId: "a", table: "1" }]);
  });

  // FR-001: 出場者の両方の枠が確定していない対戦カードは次戦候補から除外する。
  describe("eligibility (FR-001)", () => {
    it("excludes a card where one entrant slot is still unresolved (waiting on a prior match's result)", () => {
      const cards = [
        makeCard({ id: "a", round: 1, identifier: "R1-1", entrant2Id: null }),
        makeCard({ id: "b", round: 1, identifier: "R1-2" }),
      ];
      expect(computeNextMatchSuggestions(cards, ["1"])).toEqual([
        { matchCardId: "b", table: "1" },
      ]);
    });

    it("excludes a BYE-only match (one entrant slot has no opponent at all) just like any other undecided match", () => {
      // 不戦勝(BYE): 片方の枠にしか対戦相手が存在しない。理由を問わず、
      // 両方の枠が確定していない対戦はすべて対象外(ユーザー訂正済みの仕様)。
      const byeCard = makeCard({
        id: "bye",
        round: 1,
        identifier: "R1-1",
        entrant2Id: null,
        entrant1SourceMatchId: null,
        entrant2SourceMatchId: null,
      });
      const decidedCard = makeCard({ id: "b", round: 1, identifier: "R1-2" });
      expect(
        computeNextMatchSuggestions([byeCard, decidedCard], ["1"]),
      ).toEqual([{ matchCardId: "b", table: "1" }]);
      // BYEしか残っていない場合は、次戦候補は0件になる(BYE専用の確定操作は
      // 次戦サジェストの外で行う既存の別機能)。
      expect(computeNextMatchSuggestions([byeCard], ["1"])).toEqual([]);
    });
  });

  // FR-002〜FR-004: プール抜けの対戦からの遠さが大きい対戦を優先する。
  describe("distance-based priority (FR-002〜FR-004)", () => {
    it("prioritizes the match farthest from the pool-exit match over a nearer one, even though the anchor itself is not yet eligible", () => {
      const wf = makeCard({
        id: "wf",
        identifier: "WF",
        round: 3,
        bracketSide: "WINNERS",
        entrant1Id: null,
        entrant2Id: null,
        entrant1SourceMatchId: "wsf",
      });
      const wsf = makeCard({
        id: "wsf",
        identifier: "WSF",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "r1",
      });
      const r1 = makeCard({
        id: "r1",
        identifier: "R1",
        round: 1,
        bracketSide: "WINNERS",
      });
      // 1台のみ: 距離3のr1が距離2のwsfより優先される。wf(距離1)はまだ
      // 出場者未確定のため候補にすらならない。
      expect(computeNextMatchSuggestions([wf, wsf, r1], ["1"])).toEqual([
        { matchCardId: "r1", table: "1" },
      ]);
    });

    it("still includes the pool-exit match itself once it becomes eligible, at lower priority than farther matches (Edge Case: anchor remains a normal candidate)", () => {
      const wf = makeCard({
        id: "wf",
        identifier: "WF",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "wsf",
      });
      const wsf = makeCard({
        id: "wsf",
        identifier: "WSF",
        round: 1,
        bracketSide: "WINNERS",
      });
      // 2台あれば、距離2のwsfが先、距離1の基準点wf自身も通常どおり
      // 候補になり得る(基準点であることと候補から外れることは別)。
      expect(computeNextMatchSuggestions([wf, wsf], ["1", "2"])).toEqual([
        { matchCardId: "wsf", table: "1" },
        { matchCardId: "wf", table: "2" },
      ]);
    });

    it("also applies distance-based priority to the table-less pool-wide fallback (FR-009)", () => {
      const wf = makeCard({
        id: "wf",
        identifier: "WF",
        round: 3,
        bracketSide: "WINNERS",
        entrant1Id: null,
        entrant2Id: null,
        entrant1SourceMatchId: "wsf",
      });
      const wsf = makeCard({
        id: "wsf",
        identifier: "WSF",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "r1",
      });
      const r1 = makeCard({
        id: "r1",
        identifier: "R1",
        round: 1,
        bracketSide: "WINNERS",
      });
      expect(computeNextMatchSuggestions([wf, wsf, r1], [])).toEqual([
        { matchCardId: "r1", table: null },
      ]);
    });
  });

  // FR-005: 遠さが等しい場合、敗者側を勝者側より優先する。
  it("prefers the LOSERS-side match over a WINNERS-side match at equal distance (FR-005)", () => {
    const wf = makeCard({
      id: "wf",
      identifier: "WF",
      round: 2,
      bracketSide: "WINNERS",
      entrant1Id: null,
      entrant2Id: null,
      entrant1SourceMatchId: "wsf",
    });
    const wsf = makeCard({
      id: "wsf",
      identifier: "WSF",
      round: 1,
      bracketSide: "WINNERS",
    });
    const lf = makeCard({
      id: "lf",
      identifier: "LF",
      round: 2,
      bracketSide: "LOSERS",
      entrant1Id: null,
      entrant2Id: null,
      entrant1SourceMatchId: "lsf",
    });
    const lsf = makeCard({
      id: "lsf",
      identifier: "LSF",
      round: 1,
      bracketSide: "LOSERS",
    });
    // wsf・lsfは共に距離2。1台のみなので敗者側のlsfが優先される。
    expect(computeNextMatchSuggestions([wf, wsf, lf, lsf], ["1"])).toEqual([
      { matchCardId: "lsf", table: "1" },
    ]);
  });

  // FR-006: 遠さ・側が等しい場合、組合せ図上でより上に表示されている対戦を優先する。
  it("prefers the match displayed higher on the bracket board when distance and side are both equal (FR-006)", () => {
    // 出場元を持たない(=leafな)同一ラウンドの2対戦は、identifier順の
    // 連番でslotが決まる(bracketLayout.tsのフォールバック)。identifier
    // "A"の方が先にslot 0を得るため、"B"より上に表示される。
    const l1a = makeCard({
      id: "l1a",
      identifier: "B",
      round: 1,
      bracketSide: "LOSERS",
    });
    const l1b = makeCard({
      id: "l1b",
      identifier: "A",
      round: 1,
      bracketSide: "LOSERS",
    });
    expect(computeNextMatchSuggestions([l1a, l1b], ["1"])).toEqual([
      { matchCardId: "l1b", table: "1" },
    ]);
  });

  // SC-005: プール開始直後は、出場者が両方あらかじめ確定している初戦のみが対象になる。
  it("suggests only from round-1 matches right at pool start, before any results are entered", () => {
    const round1a = makeCard({
      id: "r1a",
      identifier: "A",
      round: 1,
      bracketSide: "WINNERS",
    });
    const round1b = makeCard({
      id: "r1b",
      identifier: "B",
      round: 1,
      bracketSide: "WINNERS",
    });
    const round2 = makeCard({
      id: "r2",
      identifier: "C",
      round: 2,
      bracketSide: "WINNERS",
      entrant1Id: null,
      entrant2Id: null,
      entrant1SourceMatchId: "r1a",
      entrant2SourceMatchId: "r1b",
    });
    const result = computeNextMatchSuggestions(
      [round1a, round1b, round2],
      ["1", "2", "3"],
    );
    expect(result.map((s) => s.matchCardId).sort()).toEqual(["r1a", "r1b"]);
  });

  // FR-008: 総当り・敗者側が存在しない形式では既存のround→identifierフォールバックを維持する。
  describe("fallback for round-robin / no-losers-side pools (FR-008)", () => {
    it("keeps round-then-identifier ordering for round-robin pools, while still applying the FR-001 eligibility filter", () => {
      const cards = [
        makeCard({ id: "a", round: 2, identifier: "R2-1" }),
        makeCard({ id: "b", round: 1, identifier: "R1-2", entrant2Id: null }),
        makeCard({ id: "c", round: 1, identifier: "R1-1" }),
      ];
      expect(computeNextMatchSuggestions(cards, ["1"])).toEqual([
        { matchCardId: "c", table: "1" },
      ]);
    });

    it("applies distance-based priority using only the WINNERS side when no LOSERS-side cards exist (single elimination)", () => {
      const final = makeCard({
        id: "final",
        identifier: "F",
        round: 3,
        bracketSide: "WINNERS",
        entrant1Id: null,
        entrant2Id: null,
        entrant1SourceMatchId: "r2",
      });
      const r2 = makeCard({
        id: "r2",
        identifier: "R2",
        round: 2,
        bracketSide: "WINNERS",
        entrant1SourceMatchId: "r1",
      });
      const r1 = makeCard({
        id: "r1",
        identifier: "R1",
        round: 1,
        bracketSide: "WINNERS",
      });
      expect(computeNextMatchSuggestions([final, r2, r1], ["1"])).toEqual([
        { matchCardId: "r1", table: "1" },
      ]);
    });
  });

  // FR-007: 進められる対戦の数が対戦台数に満たなくてもエラーにしない。
  describe("table-shortfall tolerance (FR-007)", () => {
    it("fills only as many tables as there are eligible candidates, without erroring", () => {
      const cards = [makeCard({ id: "a", round: 1, identifier: "R1-1" })];
      expect(computeNextMatchSuggestions(cards, ["1", "2", "3"])).toEqual([
        { matchCardId: "a", table: "1" },
      ]);
    });

    it("returns an empty array (no suggestions for any table) when there are no eligible candidates at all", () => {
      const cards = [
        makeCard({ id: "a", round: 1, identifier: "R1-1", entrant2Id: null }),
      ];
      expect(computeNextMatchSuggestions(cards, ["1", "2", "3"])).toEqual([]);
    });
  });
});
