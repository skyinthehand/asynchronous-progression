import type { MatchCard } from "../entities/matchCard.js";
import { isPreviewSetId } from "./previewId.js";

/**
 * ユーザーフィードバック(2026-08-13): start.gg側でブラケットが「開始」
 * される前に対戦結果を記録できてしまうと、開始後にSet IDがpreview形式
 * から実IDへ切り替わった際、ローカルの結果が孤立して送信されなくなる。
 * この状態を「プレビューモード」として画面上に明示し、編集を禁止する
 * ことで、複雑な引き継ぎ処理を作らずに問題を回避する。
 *
 * 対戦カードが1件でもpreview ID形式なら、そのプール全体をプレビュー
 * モードとして扱う(start.ggのブラケット開始状態はSet単位ではなく
 * ブラケット単位のため)。
 */
export function computeIsPreviewMode(matchCards: MatchCard[]): boolean {
  return matchCards.some((card) => isPreviewSetId(card.id));
}
