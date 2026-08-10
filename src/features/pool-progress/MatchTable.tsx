import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { MatchCardRow } from "./MatchCardRow.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";

interface MatchTableProps {
  matchCards: MatchCard[];
  entrantById: Map<string, Entrant>;
  nextCardIds: Set<string>;
  onRecordResult: (matchCardId: string, result: MatchResultSubmission) => void;
  tableNumbers: string[];
  onAssignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  onSetInProgress: (matchCardId: string) => void;
}

/** FR-023: 総当り形式など、ブラケット図を持たないプールの対戦カード表。 */
export function MatchTable({
  matchCards,
  entrantById,
  nextCardIds,
  onRecordResult,
  tableNumbers,
  onAssignTable,
  onSetInProgress,
}: MatchTableProps) {
  return (
    <table className="app-table match-table">
      <thead>
        <tr>
          <th>対戦</th>
          <th>対戦カード</th>
          <th>対戦台</th>
          <th>結果・操作</th>
        </tr>
      </thead>
      <tbody>
        {matchCards.map((card) => (
          <MatchCardRow
            key={card.id}
            card={card}
            entrantById={entrantById}
            isNext={nextCardIds.has(card.id)}
            onRecordResult={onRecordResult}
            tableNumbers={tableNumbers}
            onAssignTable={onAssignTable}
            onSetInProgress={onSetInProgress}
          />
        ))}
      </tbody>
    </table>
  );
}
