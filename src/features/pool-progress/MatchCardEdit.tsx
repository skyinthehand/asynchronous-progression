import { useState } from "react";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";
import { ScoreEntryForm } from "./ScoreEntryForm.js";

interface MatchCardEditProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  onRecordResult: (matchCardId: string, result: MatchResultSubmission) => void;
}

/**
 * 001-pool-progression-tracker FR-021/FR-022: 確定済みの対戦結果を後から
 * 修正できる。ただし後続の対戦が既に進行している場合(isLocked)は修正を
 * 拒否する。002-match-scoring-and-flow FR-008により、修正もスコア/DQ入力
 * (ScoreEntryForm)で行う。
 */
export function MatchCardEdit({
  card,
  entrantById,
  onRecordResult,
}: MatchCardEditProps) {
  const [editing, setEditing] = useState(false);

  if (card.isLocked) {
    return (
      <span className="match-card-edit-locked">
        後続の対戦が進行しているため、この結果は修正できません。
      </span>
    );
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}>
        結果を修正
      </button>
    );
  }

  return (
    <span className="match-card-edit-form">
      <ScoreEntryForm
        card={card}
        entrantById={entrantById}
        submitLabel="修正を確定"
        initial={{
          entrant1Score: card.entrant1Score,
          entrant2Score: card.entrant2Score,
          entrant1DQ: card.entrant1DQ,
          entrant2DQ: card.entrant2DQ,
          entrant1W: card.entrant1W,
          entrant2W: card.entrant2W,
        }}
        onSubmit={(result) => {
          onRecordResult(card.id, result);
          setEditing(false);
        }}
      />
      <button type="button" onClick={() => setEditing(false)}>
        キャンセル
      </button>
    </span>
  );
}
