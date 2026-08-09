import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { Pool } from "../../domain/entities/pool.js";
import { BracketBoard } from "./BracketBoard.js";
import { MatchTable } from "./MatchTable.js";
import { findNextMatchCard } from "./nextCardIndicator.js";

interface MatchCardListProps {
  pool: Pool | null;
  matchCards: MatchCard[];
  entrants: Entrant[];
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

/**
 * FR-007/FR-009/FR-023: 対戦カード一覧の表示・結果入力・次カードの強調
 * 表示。`bracketType` に応じ、startggのブラケット表示に合わせた列形式
 * (勝者側/敗者側トーナメント)か、対戦表形式(総当りなど)かを切り替える
 * (印刷用レイアウトと同じ方針)。
 */
export function MatchCardList({
  pool,
  matchCards,
  entrants,
  onRecordResult,
}: MatchCardListProps) {
  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const nextCard = findNextMatchCard(matchCards);
  const hasBracket =
    pool?.bracketType === "SINGLE_ELIMINATION" ||
    pool?.bracketType === "DOUBLE_ELIMINATION";

  return (
    <section className="match-card-list">
      <h2>対戦カード</h2>
      {matchCards.length === 0 ? (
        <p>対戦カードがまだありません。</p>
      ) : hasBracket ? (
        <BracketBoard
          matchCards={matchCards}
          entrantById={entrantById}
          nextCardId={nextCard?.id ?? null}
          onRecordResult={onRecordResult}
        />
      ) : (
        <MatchTable
          matchCards={matchCards}
          entrantById={entrantById}
          nextCardId={nextCard?.id ?? null}
          onRecordResult={onRecordResult}
        />
      )}
    </section>
  );
}
