import { useState } from "react";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { MatchCardEdit } from "./MatchCardEdit.js";

interface MatchCardRowProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  isNext: boolean;
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/** 総当り形式など、ブラケット図を持たないプールの対戦カード表(行)。 */
export function MatchCardRow({
  card,
  entrantById,
  isNext,
  onRecordResult,
}: MatchCardRowProps) {
  const [score, setScore] = useState("");
  const isEditable = card.status !== "COMPLETED";

  return (
    <tr
      className={["match-card", isNext ? "match-card-next" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <td className="match-card-identifier">{card.identifier}</td>
      <td className="match-card-entrants">
        {entrantName(entrantById, card.entrant1Id)} vs{" "}
        {entrantName(entrantById, card.entrant2Id)}
      </td>
      <td>
        {card.status === "COMPLETED" ? (
          <span className="match-card-result">
            勝者: {entrantName(entrantById, card.winnerId)}
            {card.score ? ` (${card.score})` : ""}
            <MatchCardEdit
              card={card}
              entrantById={entrantById}
              onRecordResult={onRecordResult}
            />
          </span>
        ) : (
          isEditable && (
            <span className="match-card-actions">
              <input
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="スコア(任意)"
              />
              {card.entrant1Id && (
                <button
                  type="button"
                  onClick={() =>
                    onRecordResult(
                      card.id,
                      card.entrant1Id as string,
                      score.trim() || null,
                    )
                  }
                >
                  {entrantName(entrantById, card.entrant1Id)} の勝ち
                </button>
              )}
              {card.entrant2Id && (
                <button
                  type="button"
                  onClick={() =>
                    onRecordResult(
                      card.id,
                      card.entrant2Id as string,
                      score.trim() || null,
                    )
                  }
                >
                  {entrantName(entrantById, card.entrant2Id)} の勝ち
                </button>
              )}
            </span>
          )
        )}
      </td>
    </tr>
  );
}
