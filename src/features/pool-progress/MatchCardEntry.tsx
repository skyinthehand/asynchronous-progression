import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { Modal } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";
import { ScoreEntryForm } from "./ScoreEntryForm.js";
import { TableNumberOptions } from "./TableNumberOptions.js";

interface MatchCardEntryProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  isNext: boolean;
  onRecordResult: (matchCardId: string, result: MatchResultSubmission) => void;
  /** FR-011/FR-013: プールに設定された対戦台番号の一覧(選択候補)。 */
  tableNumbers: string[];
  /** 対戦台選択肢の占有判定に使う、プール全体の対戦カード一覧。 */
  matchCards: MatchCard[];
  onAssignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  /** FR-009/FR-010: 未着手の対戦を任意で「進行中」に設定する。 */
  onSetInProgress: (matchCardId: string) => void;
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

/** BYE(片方の出場者が未確定)の場合の不戦勝確定用結果。スコア・DQは記録しない。 */
function byeResult(winnerId: string): MatchResultSubmission {
  return {
    entrant1Score: null,
    entrant2Score: null,
    entrant1DQ: false,
    entrant2DQ: false,
    entrant1W: false,
    entrant2W: false,
    winnerId,
    score: null,
  };
}

/**
 * FR-023: startggのブラケット表示(`match`/`match-player`要素)に合わせ、
 * 対戦者2名を縦に並べたカードとして表示する(1行の「A vs B」表記ではない)。
 *
 * ユーザーフィードバック: カード自体には操作可能な要素(ボタン・
 * プルダウン)を置かず、カード全体をタップすると編集モーダルが開く形に
 * 統一する(右上の鉛筆アイコンは「タップできる」ことを示す視覚的な合図で、
 * 実際のタップ判定はカード全体)。確定済みかつ後続の対戦が進行して
 * 修正できない対戦カードだけは、そもそも編集できることがないためタップ
 * 対象にしない。
 */
export function MatchCardEntry({
  card,
  entrantById,
  isNext,
  onRecordResult,
  tableNumbers,
  matchCards,
  onAssignTable,
  onSetInProgress,
  style,
  note,
}: MatchCardEntryProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const isEditable = card.status !== "COMPLETED";
  const isBye = Boolean(card.entrant1Id) !== Boolean(card.entrant2Id);
  const byeEntrantId = card.entrant1Id ?? card.entrant2Id;
  const canEdit = isEditable || !card.isLocked;

  function openEditModal() {
    if (canEdit) setEditModalOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (!canEdit) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setEditModalOpen(true);
    }
  }

  return (
    <li
      className={[
        "match-card",
        canEdit ? "match-card-clickable" : "",
        isNext ? "match-card-next" : "",
        card.status === "IN_PROGRESS" ? "match-card-in-progress" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      onClick={canEdit ? openEditModal : undefined}
      onKeyDown={canEdit ? handleKeyDown : undefined}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
    >
      <span className="match-card-identifier">
        <span className="match-card-identifier-text">{card.identifier}</span>
        {canEdit && (
          <span className="match-card-edit-icon" aria-hidden="true">
            ✏️
          </span>
        )}
      </span>
      {note && <span className="match-card-note">{note}</span>}
      {card.status === "IN_PROGRESS" && (
        <span className="match-card-status-badge">進行中</span>
      )}
      {isEditable && card.tableNumber && (
        <span className="match-card-table-badge">
          対戦台: {card.tableNumber}
        </span>
      )}
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
          </div>
        ))}
      </div>
      {!isEditable && card.isLocked && (
        <span className="match-card-edit-locked">
          後続の対戦が進行しているため、この結果は修正できません。
        </span>
      )}
      {editModalOpen && (
        // カード全体のonClickへのクリック伝播を止めるためだけのラッパー
        // (それ自体は操作対象ではないためキーボード操作は不要)。
        // biome-ignore lint/a11y/useKeyWithClickEvents: 伝播停止のみが目的
        <div onClick={(event) => event.stopPropagation()}>
          <Modal
            title={`${card.identifier}の編集`}
            onClose={() => setEditModalOpen(false)}
          >
            {isEditable ? (
              <>
                {card.status === "NOT_STARTED" && (
                  <button
                    type="button"
                    onClick={() => onSetInProgress(card.id)}
                  >
                    進行中にする
                  </button>
                )}
                {tableNumbers.length > 0 && (
                  <label className="match-card-table-select">
                    対戦台:
                    <select
                      value={card.tableNumber ?? ""}
                      onChange={(event) =>
                        onAssignTable(card.id, event.target.value || null)
                      }
                    >
                      <option value="">未設定</option>
                      <TableNumberOptions
                        tableNumbers={tableNumbers}
                        matchCards={matchCards}
                        excludeCardId={card.id}
                      />
                    </select>
                  </label>
                )}
                {isBye && byeEntrantId ? (
                  <button
                    type="button"
                    onClick={() => {
                      onRecordResult(card.id, byeResult(byeEntrantId));
                      setEditModalOpen(false);
                    }}
                  >
                    {entrantName(entrantById, byeEntrantId)} の不戦勝で確定
                  </button>
                ) : (
                  <ScoreEntryForm
                    card={card}
                    entrantById={entrantById}
                    onSubmit={(result) => {
                      onRecordResult(card.id, result);
                      setEditModalOpen(false);
                    }}
                  />
                )}
              </>
            ) : (
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
                  setEditModalOpen(false);
                }}
              />
            )}
          </Modal>
        </div>
      )}
    </li>
  );
}
