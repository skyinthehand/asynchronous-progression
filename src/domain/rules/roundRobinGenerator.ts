import type { Entrant } from "../entities/entrant.js";
import type { MatchCard } from "../entities/matchCard.js";

/**
 * FR-008: 総当り形式の予選プールにおいて、必要な対戦カードを過不足なく
 * 生成する。回転法(circle method)により、参加者数が奇数の場合は
 * 不戦(BYE)を1名分含めてラウンドを組む。
 */
export function generateRoundRobinMatchCards(
  poolId: string,
  entrants: Entrant[],
): MatchCard[] {
  const ids = entrants.map((entrant) => entrant.id);
  if (ids.length < 2) {
    return [];
  }

  const hasBye = ids.length % 2 !== 0;
  const players: (string | null)[] = hasBye ? [...ids, null] : [...ids];
  const playerCount = players.length;
  const roundsCount = playerCount - 1;
  const half = playerCount / 2;

  const fixed = players[0];
  const rotating = players.slice(1);
  const cards: MatchCard[] = [];
  let matchIndex = 0;

  for (let round = 0; round < roundsCount; round++) {
    const roundPlayers = [fixed, ...rotating];
    for (let i = 0; i < half; i++) {
      const entrant1Id = roundPlayers[i];
      const entrant2Id = roundPlayers[playerCount - 1 - i];
      if (entrant1Id === null || entrant2Id === null) {
        continue;
      }
      matchIndex += 1;
      cards.push({
        id: `${poolId}-rr-${matchIndex}`,
        poolId,
        identifier: `R${round + 1}-${i + 1}`,
        round: round + 1,
        bracketSide: "N/A",
        tableNumber: null,
        entrant1Id,
        entrant2Id,
        winnerId: null,
        score: null,
        status: "NOT_STARTED",
        isLocked: false,
        editHistory: [],
        localOnly: true,
        entrant1SourceMatchId: null,
        entrant2SourceMatchId: null,
        entrant1Score: null,
        entrant2Score: null,
        entrant1DQ: false,
        entrant2DQ: false,
        entrant1W: false,
        entrant2W: false,
        statusLocalOnly: false,
        tableLocalOnly: false,
        isStreamed: false,
      });
    }
    const last = rotating.pop();
    if (last !== undefined) {
      rotating.unshift(last);
    }
  }

  return cards;
}
