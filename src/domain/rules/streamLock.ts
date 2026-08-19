import type { MatchCard } from "../entities/matchCard.js";

/**
 * 005-stream-match-lock: start.gg上で配信(ストリーム)が割り当てられている
 * 対戦カードかどうかを判定する。`isPreviewSetId`(previewId.ts)・
 * `isEntrantAway`(awayStatus.ts)と同様、状態判定を専用の名前付き関数に
 * 切り出す設計方針に沿う。
 *
 * `isLocked`(後続対戦の進行によるロック)・プレビューモード(ブラケット
 * 未開始によるプール全体のロック)とは独立した、対戦カード単位の3つ目の
 * ロック条件。対戦カードの状態(未着手・進行中・確定済み)を問わず一律に
 * 適用され、確定済みカードの結果修正もロックの対象に含む
 * (spec.md Edge Cases参照)。
 */
export function isStreamLocked(card: MatchCard): boolean {
  return card.isStreamed;
}
