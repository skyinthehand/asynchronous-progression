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

  it("orders round-1 spreadsheet-style identifiers past Z (AA, AB, ...) after Z, not before it", () => {
    // 報告されたバグの再現: 単純な文字列比較(localeCompare)では
    // "AA" は先頭が'A'のため "Z" より前に来てしまう。実際のstartggの
    // 識別子はA,B,...,Z,AA,AB,...の順(スプレッドシートの列名と同じ)
    // で割り当てられるため、"Y"→"Z"→"AA"→"AB"の順に並ぶ必要がある。
    const y = makeCard({ id: "y", identifier: "Y", round: 1 });
    const z = makeCard({ id: "z", identifier: "Z", round: 1 });
    const aa = makeCard({ id: "aa", identifier: "AA", round: 1 });
    const ab = makeCard({ id: "ab", identifier: "AB", round: 1 });

    // 意図的に元のソート順をシャッフルして渡す(入力順に依存しないことの確認)。
    const [winners] = computeBracketLayout([ab, y, aa, z]);

    expect(winners.matchesByRound.get(1)).toEqual([
      { card: y, round: 1, slot: 0 },
      { card: z, round: 1, slot: 1 },
      { card: aa, round: 1, slot: 2 },
      { card: ab, round: 1, slot: 3 },
    ]);
  });

  it("keeps round-2 averaged positions consistent with the corrected round-1 spreadsheet order", () => {
    const y = makeCard({ id: "y", identifier: "Y", round: 1 });
    const z = makeCard({ id: "z", identifier: "Z", round: 1 });
    const aa = makeCard({ id: "aa", identifier: "AA", round: 1 });
    const ab = makeCard({ id: "ab", identifier: "AB", round: 1 });
    // Y×Z、AA×AB という2組の対戦がそれぞれラウンド2の対戦を生む。
    const r2First = makeCard({
      id: "r2-first",
      identifier: "AH",
      round: 2,
      entrant1SourceMatchId: "y",
      entrant2SourceMatchId: "z",
    });
    const r2Second = makeCard({
      id: "r2-second",
      identifier: "AL",
      round: 2,
      entrant1SourceMatchId: "aa",
      entrant2SourceMatchId: "ab",
    });

    const [winners] = computeBracketLayout([ab, y, aa, z, r2Second, r2First]);

    const round2 = winners.matchesByRound.get(2) ?? [];
    const first = round2.find((m) => m.card.id === "r2-first");
    const second = round2.find((m) => m.card.id === "r2-second");
    expect(first?.slot).toBe(0.5);
    expect(second?.slot).toBe(2.5);
    // Y×Zから生まれたAHはAA×ABから生まれたALより上(小さいslot)に来るべき。
    expect(first?.slot).toBeLessThan(second?.slot ?? Number.POSITIVE_INFINITY);
  });

  it("derives round-1 slots from round-2's reserved positions when round-1 has BYE gaps", () => {
    // 報告されたバグの再現: Round1の対戦をidentifier順に並べるだけでは、
    // BYE(不戦勝)で一部の対戦が実在しない場合に正しい並び順にならない。
    // Round2側(Y, Z, AA)を基準に、各対戦が予約する2区画のうち実在する
    // 対戦カードだけに位置を割り当てる。
    // Y: 1人目はBYE(対応するRound1対戦なし)、2人目がRound1のA。
    // Z: 両方ともBYE(対応するRound1対戦なし)。
    // AA: 1人目はBYE、2人目がRound1のB。
    const a = makeCard({ id: "a", identifier: "A", round: 1 });
    const b = makeCard({ id: "b", identifier: "B", round: 1 });
    const y = makeCard({
      id: "y",
      identifier: "Y",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "a",
    });
    const z = makeCard({
      id: "z",
      identifier: "Z",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: null,
    });
    const aa = makeCard({
      id: "aa",
      identifier: "AA",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "b",
    });

    const [winners] = computeBracketLayout([a, b, y, z, aa]);

    // Round1にはA・Bの2枚しか実在しないが、それぞれが対応するRound2の
    // 対戦(Y, AA)の2人目の区画(slot 1, slot 5)に正しく配置される。
    expect(winners.matchesByRound.get(1)).toEqual([
      { card: a, round: 1, slot: 1 },
      { card: b, round: 1, slot: 5 },
    ]);

    const round2 = winners.matchesByRound.get(2) ?? [];
    const ySlot = round2.find((m) => m.card.id === "y")?.slot;
    const zSlot = round2.find((m) => m.card.id === "z")?.slot;
    const aaSlot = round2.find((m) => m.card.id === "aa")?.slot;
    // Y(実子Aのみ)はAの位置と同じ、AA(実子Bのみ)はBの位置と同じになる。
    expect(ySlot).toBe(1);
    expect(aaSlot).toBe(5);
    // Z(実子なし)は予約区画(2,3)の中央2.5となり、Y・AAの間に収まる。
    expect(zSlot).toBe(2.5);
    expect(ySlot).toBeLessThan(zSlot ?? Number.POSITIVE_INFINITY);
    expect(zSlot ?? Number.NEGATIVE_INFINITY).toBeLessThan(
      aaSlot ?? Number.POSITIVE_INFINITY,
    );

    // AからY、BからAAへの結線のみが作られる(Zには実子がないため結線なし)。
    expect(winners.connectors).toHaveLength(2);
    expect(winners.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromMatchId: "a", toMatchId: "y" }),
        expect.objectContaining({ fromMatchId: "b", toMatchId: "aa" }),
      ]),
    );
  });
});
