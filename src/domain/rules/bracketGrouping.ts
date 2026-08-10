import type { MatchCard } from "../entities/matchCard.js";

export type BracketSide = "WINNERS" | "LOSERS";

/**
 * startggのブラケット表示に合わせ、対戦カードを勝者側/敗者側・ラウンド
 * ごとに分類する。印刷用レイアウトと画面表示の両方から利用する共通ルール。
 *
 * これはブラケット表示用の詰め直し処理の最初の一段階に過ぎない
 * (フラットな配列を側・ラウンドの箱に振り分けるだけで、箱の中の並び順は
 * まだ決めていない)。各ラウンド内での縦位置(表示順)の計算は
 * bracketLayout.ts側で行う。保存されているデータの形、表示用に組み立て
 * 直す手順の全体像はbracketLayout.tsのcomputeBracketLayout()のコメントを
 * 参照。
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
