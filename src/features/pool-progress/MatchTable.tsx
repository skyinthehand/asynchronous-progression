import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { MatchCardRow } from "./MatchCardRow.js";

interface MatchTableProps {
  matchCards: MatchCard[];
  entrantById: Map<string, Entrant>;
  nextCardId: string | null;
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

/** FR-023: 総当り形式など、ブラケット図を持たないプールの対戦カード表。 */
export function MatchTable({
  matchCards,
  entrantById,
  nextCardId,
  onRecordResult,
}: MatchTableProps) {
  return (
    <table className="app-table match-table">
      <thead>
        <tr>
          <th>対戦</th>
          <th>対戦カード</th>
          <th>結果・操作</th>
        </tr>
      </thead>
      <tbody>
        {matchCards.map((card) => (
          <MatchCardRow
            key={card.id}
            card={card}
            entrantById={entrantById}
            isNext={nextCardId === card.id}
            onRecordResult={onRecordResult}
          />
        ))}
      </tbody>
    </table>
  );
}
