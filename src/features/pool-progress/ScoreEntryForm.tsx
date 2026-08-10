import { useState } from "react";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { resolveMatchResult } from "../../domain/rules/matchResult.js";

/** MatchCardEntry/MatchCardRow/MatchCardEdit がonRecordResultへ渡す確定済み結果。 */
export interface MatchResultSubmission {
  entrant1Score: number | null;
  entrant2Score: number | null;
  entrant1DQ: boolean;
  entrant2DQ: boolean;
  winnerId: string;
  score: string | null;
}

interface ScoreEntryFormProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  onSubmit: (result: MatchResultSubmission) => void;
  submitLabel?: string;
  /** MatchCardEdit(結果修正)から、既存の入力値を初期値として渡す(FR-008)。 */
  initial?: {
    entrant1Score: number | null;
    entrant2Score: number | null;
    entrant1DQ: boolean;
    entrant2DQ: boolean;
  };
}

const ERROR_MESSAGES: Record<"TIE" | "BOTH_DQ", string> = {
  TIE: "同点のため結果を確定できません。スコアを修正してください。",
  BOTH_DQ: "両方の出場者を同時に失格にはできません。",
};

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

function scoreToInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseScore(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) return null;
  return parsed;
}

/**
 * FR-001〜FR-008: 両出場者のスコア(0〜3)・DQ入力フォーム。ブラケット表示
 * (MatchCardEntry)・総当り表(MatchCardRow)・結果修正(MatchCardEdit)の
 * 3箇所から共通利用し、resolveMatchResultの呼び出し・TIE/BOTH_DQの
 * エラー表示を1箇所に集約する(research.md #9)。
 */
export function ScoreEntryForm({
  card,
  entrantById,
  onSubmit,
  submitLabel = "結果を確定",
  initial,
}: ScoreEntryFormProps) {
  const [entrant1Score, setEntrant1Score] = useState(
    scoreToInput(initial?.entrant1Score ?? null),
  );
  const [entrant2Score, setEntrant2Score] = useState(
    scoreToInput(initial?.entrant2Score ?? null),
  );
  const [entrant1DQ, setEntrant1DQ] = useState(initial?.entrant1DQ ?? false);
  const [entrant2DQ, setEntrant2DQ] = useState(initial?.entrant2DQ ?? false);
  const [error, setError] = useState<"TIE" | "BOTH_DQ" | null>(null);

  if (!card.entrant1Id || !card.entrant2Id) {
    return null;
  }
  const entrant1Id = card.entrant1Id;
  const entrant2Id = card.entrant2Id;

  function handleSubmit() {
    const input = {
      entrant1Score: entrant1DQ ? null : parseScore(entrant1Score),
      entrant2Score: entrant2DQ ? null : parseScore(entrant2Score),
      entrant1DQ,
      entrant2DQ,
    };
    const outcome = resolveMatchResult(input);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    setError(null);
    onSubmit({
      entrant1Score: input.entrant1Score,
      entrant2Score: input.entrant2Score,
      entrant1DQ,
      entrant2DQ,
      winnerId: outcome.winnerSlot === "entrant1" ? entrant1Id : entrant2Id,
      score: outcome.score,
    });
  }

  return (
    <div className="score-entry-form">
      <div className="score-entry-row">
        <span className="score-entry-name">
          {entrantName(entrantById, entrant1Id)}
        </span>
        <input
          className="score-entry-score-input"
          type="number"
          min={0}
          max={3}
          value={entrant1Score}
          disabled={entrant1DQ}
          onChange={(event) => setEntrant1Score(event.target.value)}
          aria-label={`${entrantName(entrantById, entrant1Id)}のスコア`}
        />
        <label className="score-entry-dq">
          <input
            type="checkbox"
            checked={entrant1DQ}
            onChange={(event) => setEntrant1DQ(event.target.checked)}
          />
          DQ
        </label>
      </div>
      <div className="score-entry-row">
        <span className="score-entry-name">
          {entrantName(entrantById, entrant2Id)}
        </span>
        <input
          className="score-entry-score-input"
          type="number"
          min={0}
          max={3}
          value={entrant2Score}
          disabled={entrant2DQ}
          onChange={(event) => setEntrant2Score(event.target.value)}
          aria-label={`${entrantName(entrantById, entrant2Id)}のスコア`}
        />
        <label className="score-entry-dq">
          <input
            type="checkbox"
            checked={entrant2DQ}
            onChange={(event) => setEntrant2DQ(event.target.checked)}
          />
          DQ
        </label>
      </div>
      {error && <p className="score-entry-error">{ERROR_MESSAGES[error]}</p>}
      <button type="button" onClick={handleSubmit}>
        {submitLabel}
      </button>
    </div>
  );
}
