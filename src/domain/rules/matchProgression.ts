import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-023: 対戦カードの結果が確定した際、その勝者を後続の対戦カード
 * (entrant1/entrant2SourceMatchIdでこのカードを出場元として参照している
 * カード)のentrant1Id/entrant2Idへ反映する。startgg同期後はstartgg側の
 * 処理で後続カードのentrantが埋まるが、オフラインでローカルに結果を
 * 入力した場合は自分で送り込む必要がある(そうしないとブラケット表示・
 * 次戦案内で後続カードがBYEのまま止まって見える)。
 */
export function advanceWinner(
  matchCards: MatchCard[],
  sourceMatchId: string,
  winnerId: string,
): MatchCard[] {
  return matchCards.map((card) => {
    const entrant1Id =
      card.entrant1SourceMatchId === sourceMatchId ? winnerId : card.entrant1Id;
    const entrant2Id =
      card.entrant2SourceMatchId === sourceMatchId ? winnerId : card.entrant2Id;
    if (entrant1Id === card.entrant1Id && entrant2Id === card.entrant2Id) {
      return card;
    }
    return { ...card, entrant1Id, entrant2Id };
  });
}
