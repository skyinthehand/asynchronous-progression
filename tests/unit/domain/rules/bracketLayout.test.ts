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
  it("keeps round-1 leaf cards in identifier order when a later round's sibling-hint lookahead would otherwise reorder them (reported bug: B displayed above A)", () => {
    // 実際に報告されたバグの再現(2026-08-19)。ラウンド1(A-D)は全て
    // leaf(出場元なし)。ラウンド2(E-H)は、各対戦がラウンド1の対戦
    // 1つ+シード(出場元なし)1つで構成される(2つの出場元がともに
    // ラウンド1、という一般的な形ではない)。ラウンド3(I,J)がE,F,G,Hを
    // 2つずつ束ねる。このI,Jからの「兄弟カード先読み」(隣接配置修正、
    // 2026-08-18)が、まだ仮の連番(processLeafRoundにより後で上書き
    // される)しか持たないE,F,G,Hの並び順を誤って入れ替えてしまい、
    // それがラウンド1(A,B,C,D)の予約区画の計算にまで伝播して、
    // 表示順がB,A,C,Dのように崩れていた。
    const a = makeCard({ id: "a", identifier: "A", round: 1 });
    const b = makeCard({ id: "b", identifier: "B", round: 1 });
    const c = makeCard({ id: "c", identifier: "C", round: 1 });
    const d = makeCard({ id: "d", identifier: "D", round: 1 });
    const e = makeCard({
      id: "e",
      identifier: "E",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "a",
    });
    const f = makeCard({
      id: "f",
      identifier: "F",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "b",
    });
    const g = makeCard({
      id: "g",
      identifier: "G",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "c",
    });
    const h = makeCard({
      id: "h",
      identifier: "H",
      round: 2,
      entrant1SourceMatchId: null,
      entrant2SourceMatchId: "d",
    });
    const i = makeCard({
      id: "i",
      identifier: "I",
      round: 3,
      entrant1SourceMatchId: "e",
      entrant2SourceMatchId: "f",
    });
    const j = makeCard({
      id: "j",
      identifier: "J",
      round: 3,
      entrant1SourceMatchId: "g",
      entrant2SourceMatchId: "h",
    });

    const [winners] = computeBracketLayout([a, b, c, d, e, f, g, h, i, j]);

    const round1 = winners.matchesByRound.get(1) ?? [];
    const order = [...round1]
      .sort((x, y) => x.slot - y.slot)
      .map((entry) => entry.card.identifier);
    expect(order).toEqual(["A", "B", "C", "D"]);

    const round2 = winners.matchesByRound.get(2) ?? [];
    const round2Order = [...round2]
      .sort((x, y) => x.slot - y.slot)
      .map((entry) => entry.card.identifier);
    expect(round2Order).toEqual(["E", "F", "G", "H"]);
  });

  it("keeps identifier order in a round where every card is a fallback (no same-side source), instead of letting sibling-hint reorder pairs (reported bug: losers side N/O swapped)", () => {
    // 実際に報告されたバグの再現(2026-08-19)。敗者側第1ラウンド
    // (N,O,P,Q)は、いずれも出場元が勝者側(別の側)のみで、同じ側の
    // 出場元を一切持たない(=全カードがfallback、anchoredなカードが
    // 1枚もない)。1つ後のラウンド(R,S)がN・O、P・Qをそれぞれ2つずつ
    // 束ねるため、隣接配置の兄弟カード先読みが働くが、siblingであるN・O
    // (やP・Q)自身もどちらもanchoredではない(=確たる根拠を持たない)
    // ため、この先読みを信用してはいけない。信用してしまうと、処理順
    // (identifier順でNがOより先)次第でNの兄弟Oが「Nの隣」に押し出され、
    // 結果としてO,N,P,Qの順(NとOが入れ替わる)になってしまっていた。
    const wa = makeCard({ id: "wa", identifier: "WA", round: 1 });
    const wb = makeCard({ id: "wb", identifier: "WB", round: 1 });
    const wc = makeCard({ id: "wc", identifier: "WC", round: 1 });
    const wd = makeCard({ id: "wd", identifier: "WD", round: 1 });
    const n = makeCard({
      id: "n",
      identifier: "N",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wa",
      entrant2SourceMatchId: null,
    });
    const o = makeCard({
      id: "o",
      identifier: "O",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wb",
      entrant2SourceMatchId: null,
    });
    const p = makeCard({
      id: "p",
      identifier: "P",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wc",
      entrant2SourceMatchId: null,
    });
    const q = makeCard({
      id: "q",
      identifier: "Q",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wd",
      entrant2SourceMatchId: null,
    });
    const r = makeCard({
      id: "r",
      identifier: "R",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "n",
      entrant2SourceMatchId: "o",
    });
    const s = makeCard({
      id: "s",
      identifier: "S",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "p",
      entrant2SourceMatchId: "q",
    });

    const [, losers] = computeBracketLayout([wa, wb, wc, wd, n, o, p, q, r, s]);

    const round1 = losers.matchesByRound.get(1) ?? [];
    const order = [...round1]
      .sort((x, y) => x.slot - y.slot)
      .map((entry) => entry.card.identifier);
    expect(order).toEqual(["N", "O", "P", "Q"]);
  });

  it("does not let a fallback (no same-side source) card overlap an anchored card in the same round (reported bug: R/T cards invisible, hidden exactly behind S/U)", () => {
    // 実際に報告されたバグの再現(2026-08-18)。同じラウンドに、
    // (1) 同じ側の出場元から位置を計算できるカード(anchored、ここでは
    // S役の"s"。前ラウンドのP役"p"を出場元に持つ)と、
    // (2) 同じ側の出場元を持たずidentifier順の連番に頼るカード
    // (fallback、ここではR役の"r"。出場元は勝者側の対戦のみ=別の側)
    // が混在する。"r"はidentifier順で"s"より先に処理されるため、
    // 修正前はfallbackの連番が0から振られ、たまたま"s"の計算結果(0)と
    // 衝突していた。結果、"r"は"s"とまったく同じ位置に描画され、
    // 後から描画される"s"の下に完全に隠れて「表示されない」ように
    // 見えていた。
    const wa = makeCard({ id: "wa", identifier: "WA", round: 1 });
    const wb = makeCard({ id: "wb", identifier: "WB", round: 1 });
    const p = makeCard({
      id: "p",
      identifier: "P",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wa",
      entrant2SourceMatchId: null,
    });
    const r = makeCard({
      id: "r",
      identifier: "R",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wb",
      entrant2SourceMatchId: null,
    });
    const s = makeCard({
      id: "s",
      identifier: "S",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "p",
      entrant2SourceMatchId: null,
    });

    const [, losers] = computeBracketLayout([wa, wb, p, r, s]);

    const round2 = losers.matchesByRound.get(2) ?? [];
    const rSlot = round2.find((entry) => entry.card.id === "r")?.slot;
    const sSlot = round2.find((entry) => entry.card.id === "s")?.slot;

    expect(rSlot).not.toBe(sSlot);
    expect(sSlot).toBe(0); // Pと同じ位置(anchored)
    expect(rSlot).toBe(1); // 0は使用済みのため、次の空き位置へ
  });

  it("places a fallback card adjacent to its anchored sibling on the correct (entrant1/entrant2) side, shifting other cards to make room instead of reordering pairs (reported bug: connector lines crossing through unrelated cards, then T/U displayed swapped)", () => {
    // 実際に報告されたバグの再現(2026-08-19、2件)。
    // 1件目: 衝突回避の修正だけでは、"r"(fallback)が"s"・"u"(anchored)
    // より後ろの位置に押し出され、本来隣り合うべき"r"・"s"が"u"を挟んで
    // 離れてしまっていた。1つ後のラウンド("v")が"r"・"s"の両方を出場元に
    // 持つことから、この2枚が組になっていることが分かるため、"r"を
    // "s"のすぐ隣に配置する。
    // 2件目: 1件目の修正(sibling隣接配置)は「siblingの前後どちらでも
    // よい」実装だったため、"t"(1つ後の対戦"w"のentrant1側=本来"u"より
    // 上に来るべき)が、"u"の真上(sの真隣)がふさがっていたことで逆側の
    // "u"の下に配置されてしまい、表示順がR,S,U,Tとなって実際のVic-Seekers
    // #1トーナメントのstart.gg表示(R,S,T,U)と一致しなくなっていた。
    // 正しい側が空いていない場合は逆側に妥協するのではなく、siblingを
    // 含む以降の位置を1つずつ後ろへずらして正しい側に割り込ませる。
    const wa = makeCard({ id: "wa", identifier: "WA", round: 1 });
    const wb = makeCard({ id: "wb", identifier: "WB", round: 1 });
    const wc = makeCard({ id: "wc", identifier: "WC", round: 1 });
    const wd = makeCard({ id: "wd", identifier: "WD", round: 1 });
    const p = makeCard({
      id: "p",
      identifier: "P",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wa",
      entrant2SourceMatchId: null,
    });
    const q = makeCard({
      id: "q",
      identifier: "Q",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wb",
      entrant2SourceMatchId: null,
    });
    const r = makeCard({
      id: "r",
      identifier: "R",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wc",
      entrant2SourceMatchId: null,
    });
    const s = makeCard({
      id: "s",
      identifier: "S",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wd",
      entrant2SourceMatchId: "p",
    });
    const t = makeCard({
      id: "t",
      identifier: "T",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wd",
      entrant2SourceMatchId: null,
    });
    const u = makeCard({
      id: "u",
      identifier: "U",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wc",
      entrant2SourceMatchId: "q",
    });
    const v = makeCard({
      id: "v",
      identifier: "V",
      round: -3,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "r",
      entrant2SourceMatchId: "s",
    });
    const w = makeCard({
      id: "w",
      identifier: "W",
      round: -3,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "t",
      entrant2SourceMatchId: "u",
    });

    const [, losers] = computeBracketLayout([
      wa,
      wb,
      wc,
      wd,
      p,
      q,
      r,
      s,
      t,
      u,
      v,
      w,
    ]);

    const round2 = losers.matchesByRound.get(2) ?? [];
    const round3 = losers.matchesByRound.get(3) ?? [];
    const slotOf = (id: string) =>
      round2.find((entry) => entry.card.id === id)?.slot;

    // rはsibling(s)の空いている隣(1つ前、entrant1側なのでsより上)に
    // 配置され、その結果sより前の位置(マイナス)になるため、側全体が
    // 底上げされてr=0から始まる。
    // tはsibling(u)のentrant1側(uより上)に来るべきだが、uの真上(=sの
    // すぐ隣)は既にsが使っているため、uとそれ以降を1つ後ろへずらして
    // 割り込む。結果としてu(anchored、qと同じ相対位置だったもの)は
    // ずれてt(3)の後ろのt+1ではなく、tがuの手前に入る形でt=2, u=3となる。
    expect(slotOf("r")).toBe(0);
    expect(slotOf("s")).toBe(1); // pと同じ相対位置(anchored)
    expect(slotOf("t")).toBe(2); // uのentrant1側(uより上)への割り込み
    expect(slotOf("u")).toBe(3); // tの割り込みで1つ後ろへずれた

    // r・sの間隔、t・u間の間隔がそれぞれ1で、他のカードをまたがず
    // vへ収束できる(結線が交差しない)。
    const vEntry = round3.find((entry) => entry.card.id === "v");
    const wEntry = round3.find((entry) => entry.card.id === "w");
    expect(vEntry?.slot).toBe(0.5);
    expect(wEntry?.slot).toBe(2.5);
    expect(vEntry?.slot).toBeLessThan(wEntry?.slot ?? Number.POSITIVE_INFINITY);

    // 実際に報告されたバグ(2026-08-19、3件目): tをuの手前に割り込ませる
    // ためにu(anchored)をずらした結果、uの出場元であるq(前のラウンド)を
    // 追いかけてずらさなかったため、qがuと同じ行に見えず、無関係なt側の
    // 行に見えてしまっていた。pがsと同じ行に揃うのと同様、qもuと同じ行に
    // 揃わなければならない。
    const round1 = losers.matchesByRound.get(1) ?? [];
    const pSlot = round1.find((entry) => entry.card.id === "p")?.slot;
    const qSlot = round1.find((entry) => entry.card.id === "q")?.slot;
    expect(pSlot).toBe(slotOf("s"));
    expect(qSlot).toBe(slotOf("u"));
  });

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

  it("does not let a cross-side (winners→losers drop) source pull a losers match away from its same-side pair", () => {
    // 報告されたバグの再現: 敗者側第2ラウンドの対戦(L, M)は、同じ側の
    // 出場元(敗者側第1ラウンドの勝者J, K)と、別の側の出場元(勝者側から
    // 落ちてきた敗者)の両方を持つ。この2つを平均してしまうと、勝者側と
    // 敗者側で縦位置の縮尺が違うため、LはJの隣に、MはKの隣に来ない
    // (=「Jの横にLがなく、Kの横にMがない」)。
    const wa = makeCard({ id: "wa", identifier: "WA", round: 1 });
    const wb = makeCard({ id: "wb", identifier: "WB", round: 1 });
    const wc = makeCard({ id: "wc", identifier: "WC", round: 1 });
    const wd = makeCard({ id: "wd", identifier: "WD", round: 1 });
    const j = makeCard({
      id: "j",
      identifier: "J",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wa",
      entrant2SourceMatchId: "wc",
    });
    const k = makeCard({
      id: "k",
      identifier: "K",
      round: -1,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "wb",
      entrant2SourceMatchId: "wd",
    });
    const l = makeCard({
      id: "l",
      identifier: "L",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "j",
      entrant2SourceMatchId: "wb",
    });
    const m = makeCard({
      id: "m",
      identifier: "M",
      round: -2,
      bracketSide: "LOSERS",
      entrant1SourceMatchId: "k",
      entrant2SourceMatchId: "wd",
    });

    const [, losers] = computeBracketLayout([wa, wb, wc, wd, j, k, l, m]);

    const round1 = losers.matchesByRound.get(1) ?? [];
    const round2 = losers.matchesByRound.get(2) ?? [];
    const jSlot = round1.find((entry) => entry.card.id === "j")?.slot;
    const kSlot = round1.find((entry) => entry.card.id === "k")?.slot;
    const lSlot = round2.find((entry) => entry.card.id === "l")?.slot;
    const mSlot = round2.find((entry) => entry.card.id === "m")?.slot;

    expect(lSlot).toBe(jSlot);
    expect(mSlot).toBe(kSlot);

    // 別の側からの出場元(WB, WD)は結線ではなく注記として記録される。
    expect(losers.crossSideOrigins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toMatchId: "l", fromMatchId: "wb" }),
        expect.objectContaining({ toMatchId: "m", fromMatchId: "wd" }),
      ]),
    );
    expect(
      losers.connectors.some(
        (c) => c.fromMatchId === "wb" || c.fromMatchId === "wd",
      ),
    ).toBe(false);
  });
});
