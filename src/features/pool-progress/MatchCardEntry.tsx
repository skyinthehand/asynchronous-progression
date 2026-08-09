import { type CSSProperties, useState } from "react";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { MatchCardEdit } from "./MatchCardEdit.js";

interface MatchCardEntryProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  isNext: boolean;
  onRecordResult: (
    matchCardId: string,
    winnerId: string,
    score: string | null,
  ) => void;
  /** FR-023: ブラケット木の中でツリー状に配置するための位置指定。 */
  style?: CSSProperties;
  /** FR-023: 別の側(勝者側の敗者など)から出場者が来ている場合の注記。 */
  note?: string;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/** startggのブラケット表示(勝者は緑・強調、敗者はグレー)に合わせた対戦者行の状態。 */
function playerStateClassName(card: MatchCard, entrantId: string | null) {
  if (card.status !== "COMPLETED" || !entrantId) return "match-card-player";
  return entrantId === card.winnerId
    ? "match-card-player match-card-player-winner"
    : "match-card-player match-card-player-loser";
}

/**
 * FR-023: startggのブラケット表示(`match`/`match-player`要素)に合わせ、
 * 対戦者2名を縦に並べたカードとして表示する(1行の「A vs B」表記ではない)。
 */
export function MatchCardEntry({
  card,
  entrantById,
  isNext,
  onRecordResult,
  style,
  note,
}: MatchCardEntryProps) {
  const [score, setScore] = useState("");
  const isEditable = card.status !== "COMPLETED";

  return (
    <li
      className={["match-card", isNext ? "match-card-next" : ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <span className="match-card-identifier">{card.identifier}</span>
      {note && <span className="match-card-note">{note}</span>}
      <div className="match-card-players">
        {(
          [
            ["entrant1", card.entrant1Id],
            ["entrant2", card.entrant2Id],
          ] as const
        ).map(([slotKey, entrantId]) => (
          <div className={playerStateClassName(card, entrantId)} key={slotKey}>
            <span className="match-card-player-name">
              {entrantName(entrantById, entrantId)}
            </span>
            {card.status === "COMPLETED" && entrantId === card.winnerId && (
              <span className="match-card-player-score">
                {card.score ?? "W"}
              </span>
            )}
            {isEditable && entrantId && (
              <button
                type="button"
                onClick={() =>
                  onRecordResult(card.id, entrantId, score.trim() || null)
                }
              >
                {entrantName(entrantById, entrantId)} の勝ち
              </button>
            )}
          </div>
        ))}
      </div>
      {isEditable ? (
        card.entrant1Id &&
        card.entrant2Id && (
          <input
            className="match-card-score-input"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            placeholder="スコア(任意)"
          />
        )
      ) : (
        <MatchCardEdit
          card={card}
          entrantById={entrantById}
          onRecordResult={onRecordResult}
        />
      )}
    </li>
  );
}
