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
  entrant1W: boolean;
  entrant2W: boolean;
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
    entrant1W: boolean;
    entrant2W: boolean;
  };
}

/** 1人分のスコア選択肢。文字入力はさせず、ボタンから選ぶ形にする。 */
type Selection = "DQ" | "0" | "1" | "2" | "3" | "W" | null;

const OPTIONS: readonly Exclude<Selection, null>[] = [
  "DQ",
  "0",
  "1",
  "2",
  "3",
  "W",
];

const ERROR_MESSAGES: Record<"TIE" | "BOTH_DQ" | "BOTH_W", string> = {
  TIE: "同点のため結果を確定できません。スコアを修正してください。",
  BOTH_DQ: "両方の出場者を同時に失格にはできません。",
  BOTH_W: "両方の出場者を同時に勝者(W)にはできません。",
};

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

function initialSelection(input: {
  score: number | null;
  dq: boolean;
  w: boolean;
}): Selection {
  if (input.w) return "W";
  if (input.dq) return "DQ";
  if (input.score === null) return null;
  return String(input.score) as Selection;
}

function toResultFields(selection: Selection): {
  score: number | null;
  dq: boolean;
  w: boolean;
} {
  if (selection === "W") return { score: null, dq: false, w: true };
  if (selection === "DQ") return { score: null, dq: true, w: false };
  if (selection === null) return { score: null, dq: false, w: false };
  return { score: Number(selection), dq: false, w: false };
}

/**
 * FR-001〜FR-008: 両出場者のスコア(DQ/0/1/2/3/Wのいずれか1つ)入力。文字
 * 入力ではなくボタン選択式にする。片方を選択した瞬間、まだ何も選ばれて
 * いないもう一方は自動的に「0」が選ばれた状態になる(FR-004の自動0補完を、
 * 確定前の時点で画面上にも反映する。結果を自動確定するわけではなく、
 * あくまで「結果を確定」ボタンを押すまでは未確定のまま)。
 * 「W」はスコアが分からず勝者のみ分かる場合の入力(ユーザーフィードバック
 * 2026-08-12)。DQの逆で、選んだ側自身が勝者になる。
 * ブラケット表示(MatchCardEntry)・総当り表(MatchCardRow)・結果修正
 * (MatchCardEdit)の3箇所から共通利用し、resolveMatchResultの呼び出し・
 * TIE/BOTH_DQ/BOTH_Wのエラー表示を1箇所に集約する(research.md #9)。
 */
export function ScoreEntryForm({
  card,
  entrantById,
  onSubmit,
  submitLabel = "結果を確定",
  initial,
}: ScoreEntryFormProps) {
  const [entrant1Selection, setEntrant1Selection] = useState<Selection>(
    initial
      ? initialSelection({
          score: initial.entrant1Score,
          dq: initial.entrant1DQ,
          w: initial.entrant1W,
        })
      : null,
  );
  const [entrant2Selection, setEntrant2Selection] = useState<Selection>(
    initial
      ? initialSelection({
          score: initial.entrant2Score,
          dq: initial.entrant2DQ,
          w: initial.entrant2W,
        })
      : null,
  );
  const [error, setError] = useState<"TIE" | "BOTH_DQ" | "BOTH_W" | null>(null);

  if (!card.entrant1Id || !card.entrant2Id) {
    return null;
  }
  const entrant1Id = card.entrant1Id;
  const entrant2Id = card.entrant2Id;

  function selectEntrant1(option: Selection) {
    setEntrant1Selection(option);
    setEntrant2Selection((prev) => (prev === null ? "0" : prev));
  }

  function selectEntrant2(option: Selection) {
    setEntrant2Selection(option);
    setEntrant1Selection((prev) => (prev === null ? "0" : prev));
  }

  function handleSubmit() {
    const entrant1 = toResultFields(entrant1Selection);
    const entrant2 = toResultFields(entrant2Selection);
    const input = {
      entrant1Score: entrant1.score,
      entrant2Score: entrant2.score,
      entrant1DQ: entrant1.dq,
      entrant2DQ: entrant2.dq,
      entrant1W: entrant1.w,
      entrant2W: entrant2.w,
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
      entrant1DQ: input.entrant1DQ,
      entrant2DQ: input.entrant2DQ,
      entrant1W: input.entrant1W,
      entrant2W: input.entrant2W,
      winnerId: outcome.winnerSlot === "entrant1" ? entrant1Id : entrant2Id,
      score: outcome.score,
    });
  }

  return (
    <div className="score-entry-form">
      {(
        [
          [entrant1Id, entrant1Selection, selectEntrant1],
          [entrant2Id, entrant2Selection, selectEntrant2],
        ] as const
      ).map(([entrantId, selection, select]) => {
        const name = entrantName(entrantById, entrantId);
        return (
          <fieldset
            className="score-entry-row"
            key={entrantId}
            aria-label={`${name}のスコア`}
          >
            <legend className="score-entry-name">{name}</legend>
            <div className="score-entry-options">
              {OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selection === option}
                  className={[
                    "score-entry-option",
                    selection === option ? "score-entry-option-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => select(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      {error && <p className="score-entry-error">{ERROR_MESSAGES[error]}</p>}
      <button type="button" onClick={handleSubmit}>
        {submitLabel}
      </button>
    </div>
  );
}
