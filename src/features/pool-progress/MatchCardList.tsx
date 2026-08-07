import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { MatchCardEntry } from "./MatchCardEntry.js";
import { findNextMatchCard } from "./nextCardIndicator.js";

interface MatchCardListProps {
  matchCards: MatchCard[];
  entrants: Entrant[];
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

/** FR-007/FR-009: 対戦カード一覧の表示・結果入力・次カードの強調表示。 */
export function MatchCardList({
  matchCards,
  entrants,
  onRecordResult,
}: MatchCardListProps) {
  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const nextCard = findNextMatchCard(matchCards);

  return (
    <section className="match-card-list">
      <h2>対戦カード</h2>
      {matchCards.length === 0 ? (
        <p>対戦カードがまだありません。</p>
      ) : (
        <ul>
          {matchCards.map((card) => (
            <MatchCardEntry
              key={card.id}
              card={card}
              entrantById={entrantById}
              isNext={nextCard?.id === card.id}
              onRecordResult={onRecordResult}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
