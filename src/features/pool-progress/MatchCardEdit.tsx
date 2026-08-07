import { useState } from "react";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";

interface MatchCardEditProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

function name(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/**
 * FR-021/FR-022: 確定済みの対戦結果を後から修正できる。ただし後続の対戦が
 * 既に進行している場合(isLocked)は修正を拒否する。
 */
export function MatchCardEdit({
  card,
  entrantById,
  onRecordResult,
}: MatchCardEditProps) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(card.score ?? "");

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
      <input
        value={score}
        onChange={(event) => setScore(event.target.value)}
        placeholder="スコア(任意)"
      />
      {card.entrant1Id && (
        <button
          type="button"
          onClick={() => {
            onRecordResult(
              card.id,
              card.entrant1Id as string,
              score.trim() || null,
            );
            setEditing(false);
          }}
        >
          {name(entrantById, card.entrant1Id)} の勝ち
        </button>
      )}
      {card.entrant2Id && (
        <button
          type="button"
          onClick={() => {
            onRecordResult(
              card.id,
              card.entrant2Id as string,
              score.trim() || null,
            );
            setEditing(false);
          }}
        >
          {name(entrantById, card.entrant2Id)} の勝ち
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)}>
        キャンセル
      </button>
    </span>
  );
}
