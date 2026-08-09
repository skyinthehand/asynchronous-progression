import type { MatchCard } from "../entities/matchCard.js";

export type BracketSide = "WINNERS" | "LOSERS";

/**
 * startggのブラケット表示に合わせ、対戦カードを勝者側/敗者側・ラウンド
 * ごとに分類する。印刷用レイアウトと画面表示の両方から利用する共通ルール。
 */
export function groupBySideAndRound(
  matchCards: MatchCard[],
): Record<BracketSide, Map<number, MatchCard[]>> {
  const sides: Record<BracketSide, Map<number, MatchCard[]>> = {
    WINNERS: new Map(),
    LOSERS: new Map(),
  };
  for (const card of matchCards) {
    const side: BracketSide =
      card.bracketSide === "LOSERS" ? "LOSERS" : "WINNERS";
    const round = Math.abs(card.round);
    const list = sides[side].get(round) ?? [];
    list.push(card);
    sides[side].set(round, list);
  }
  return sides;
}
