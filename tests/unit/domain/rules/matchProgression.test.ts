import { describe, expect, it } from "vitest";
import type { MatchCard } from "../../../../src/domain/entities/matchCard.js";
import {
  advanceWinner,
  reconcileAdvancement,
} from "../../../../src/domain/rules/matchProgression.js";

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

describe("advanceWinner", () => {
  it("sends the winner to a same-side downstream card's entrant1Id", () => {
    const w1 = makeCard({
      id: "w1",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: "w2",
    });

    const [, updated] = advanceWinner([w1, w3], w1);

    expect(updated.entrant1Id).toBe("e1");
    expect(updated.entrant2Id).toBeNull();
  });

  it("sends the winner to a same-side downstream card's entrant2Id", () => {
    const w2 = makeCard({
      id: "w2",
      entrant1Id: "e3",
      entrant2Id: "e4",
      winnerId: "e3",
    });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
      entrant2SourceMatchId: "w2",
    });

    const [, updated] = advanceWinner([w2, w3], w2);

    expect(updated.entrant2Id).toBe("e3");
  });

  it("overwrites a previously advanced entrant when the source result is corrected", () => {
    const w1Corrected = makeCard({
      id: "w1",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e2",
    });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1Id: "e1",
      entrant1SourceMatchId: "w1",
    });

    const [updated] = advanceWinner([w3], w1Corrected);

    expect(updated.entrant1Id).toBe("e2");
  });

  it("does not touch cards unrelated to the completed match", () => {
    const w1 = makeCard({
      id: "w1",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const other = makeCard({ id: "other", entrant1SourceMatchId: "unrelated" });

    const [updated] = advanceWinner([other], w1);

    expect(updated).toBe(other);
  });

  it("does nothing when the completed card has no winner yet", () => {
    const w1 = makeCard({ id: "w1", entrant1Id: "e1", entrant2Id: "e2" });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
    });

    const result = advanceWinner([w1, w3], w1);

    expect(result[1]).toBe(w3);
  });

  it("sends the loser (not the winner) to a losers-bracket card referencing a winners-bracket match", () => {
    // 勝者側(WINNERS)の対戦の「負けたプレイヤー」が、敗者側(LOSERS)の
    // 対戦に反映されるべきケース(報告されたバグ)。
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const l1 = makeCard({
      id: "l1",
      bracketSide: "LOSERS",
      round: -1,
      entrant1SourceMatchId: "w1",
    });

    const [, updatedLoser] = advanceWinner([w1, l1], w1);

    expect(updatedLoser.entrant1Id).toBe("e2");
  });

  it("still sends the winner to a same-side (winners→winners) downstream card even when a losers card also references it", () => {
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const w3 = makeCard({
      id: "w3",
      bracketSide: "WINNERS",
      round: 2,
      entrant1SourceMatchId: "w1",
    });
    const l1 = makeCard({
      id: "l1",
      bracketSide: "LOSERS",
      round: -1,
      entrant2SourceMatchId: "w1",
    });

    const [, updatedWinnerSide, updatedLoserSide] = advanceWinner(
      [w1, w3, l1],
      w1,
    );

    expect(updatedWinnerSide.entrant1Id).toBe("e1");
    expect(updatedLoserSide.entrant2Id).toBe("e2");
  });

  it("does not send a loser when the winners-bracket match was a BYE (no real loser)", () => {
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: null,
      winnerId: "e1",
    });
    const l1 = makeCard({
      id: "l1",
      bracketSide: "LOSERS",
      round: -1,
      entrant1SourceMatchId: "w1",
    });

    const [, updatedLoser] = advanceWinner([w1, l1], w1);

    expect(updatedLoser.entrant1Id).toBeNull();
  });

  it("marks an updated downstream card as localOnly so sync doesn't overwrite the advanced entrant", () => {
    // startggへの結果送信(M1)がまだ動いていない間、start.gg側の後続
    // カードのentrantはnullのまま。localOnly: trueにしておかないと、
    // 次回同期でsyncRunner.tsのmergeMatchCardがこの反映結果をstartgg側の
    // 古い値で上書きしてしまう(表示の問題ではなくデータが巻き戻る)。
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const l1 = makeCard({
      id: "l1",
      bracketSide: "LOSERS",
      round: -1,
      localOnly: false,
      entrant1SourceMatchId: "w1",
    });

    const [, updatedLoser] = advanceWinner([w1, l1], w1);

    expect(updatedLoser.localOnly).toBe(true);
  });

  it("does not mark a card localOnly when nothing about it actually changed", () => {
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
    });
    const unrelated = makeCard({
      id: "unrelated",
      localOnly: false,
      entrant1SourceMatchId: "someone-else",
    });

    const [, updatedUnrelated] = advanceWinner([w1, unrelated], w1);

    expect(updatedUnrelated).toBe(unrelated);
    expect(updatedUnrelated.localOnly).toBe(false);
  });
});

describe("reconcileAdvancement", () => {
  it("re-derives a downstream entrant that was left stale by an earlier sync (self-heal)", () => {
    // 報告されたバグの再現: localOnly対応が入る前に記録された結果が、
    // その後の同期でstartgg側の古い値(null)によって上書きされてしまい、
    // 敗者側カードの出場者が抜け落ちたまま保存されているケース。
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      status: "COMPLETED",
    });
    const l1 = makeCard({
      id: "l1",
      bracketSide: "LOSERS",
      round: -1,
      entrant1Id: null, // 本来はe2(w1の敗者)が入っているべきだが、消えてしまった状態
      localOnly: false,
      entrant1SourceMatchId: "w1",
    });

    const [, healedLoser] = reconcileAdvancement([w1, l1]);

    expect(healedLoser.entrant1Id).toBe("e2");
    expect(healedLoser.localOnly).toBe(true);
  });

  it("is idempotent: running it again on already-correct data changes nothing", () => {
    const w1 = makeCard({
      id: "w1",
      bracketSide: "WINNERS",
      entrant1Id: "e1",
      entrant2Id: "e2",
      winnerId: "e1",
      status: "COMPLETED",
    });
    const w3 = makeCard({
      id: "w3",
      bracketSide: "WINNERS",
      round: 2,
      entrant1Id: "e1",
      entrant1SourceMatchId: "w1",
    });

    const once = reconcileAdvancement([w1, w3]);
    const twice = reconcileAdvancement(once);

    expect(twice[0]).toBe(once[0]);
    expect(twice[1]).toBe(once[1]);
  });

  it("does nothing when no card has a winner yet", () => {
    const w1 = makeCard({ id: "w1", entrant1Id: "e1", entrant2Id: "e2" });
    const w3 = makeCard({
      id: "w3",
      round: 2,
      entrant1SourceMatchId: "w1",
    });

    const result = reconcileAdvancement([w1, w3]);

    expect(result[0]).toBe(w1);
    expect(result[1]).toBe(w3);
  });
});
