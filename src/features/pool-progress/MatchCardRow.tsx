import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import {
  isStreamLocked,
  streamBadgeLabel,
} from "../../domain/rules/streamLock.js";
import { MatchCardEdit } from "./MatchCardEdit.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";
import { ScoreEntryForm } from "./ScoreEntryForm.js";
import { TableNumberOptions } from "./TableNumberOptions.js";

interface MatchCardRowProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  isNext: boolean;
  onRecordResult: (matchCardId: string, result: MatchResultSubmission) => void;
  tableNumbers: string[];
  /** 対戦台選択肢の占有判定に使う、プール全体の対戦カード一覧。 */
  matchCards: MatchCard[];
  onAssignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  /** FR-009/FR-010: 未着手の対戦を任意で「進行中」に設定する。 */
  onSetInProgress: (matchCardId: string) => void;
  /**
   * ユーザーフィードバック(2026-08-13): start.gg側でブラケットが未開始
   * (プレビューモード)の間は編集操作を一切表示・実行できないようにする。
   */
  readOnly?: boolean;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
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

/** 総当り形式など、ブラケット図を持たないプールの対戦カード表(行)。 */
export function MatchCardRow({
  card,
  entrantById,
  isNext,
  onRecordResult,
  tableNumbers,
  matchCards,
  onAssignTable,
  onSetInProgress,
  readOnly,
}: MatchCardRowProps) {
  // 005-stream-match-lock FR-002〜FR-004: 配信台が設定されている対戦
  // カードは新規入力を不可にする(確定済みカードの修正可否は別途、
  // MatchCardEditの描画条件・「進行中にする」ボタンの描画条件で
  // それぞれ個別にガードする。isEditableは新規入力(対戦台選択・
  // スコア入力フォーム)にのみ使われているため)。
  const isEditable =
    card.status !== "COMPLETED" && !readOnly && !isStreamLocked(card);
  const isBye = Boolean(card.entrant1Id) !== Boolean(card.entrant2Id);
  const byeEntrantId = card.entrant1Id ?? card.entrant2Id;

  return (
    <tr
      className={[
        "match-card",
        isNext ? "match-card-next" : "",
        card.status === "IN_PROGRESS" ? "match-card-in-progress" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <td className="match-card-identifier">
        {card.identifier}
        {/* 005-stream-match-lock FR-007: 配信バッジ。
            ユーザーフィードバック(2026-10-16): 未着手なら「配信予定」、
            進行中なら「配信中」を出し分け、確定済みは
            表示しない(2026-10-20、streamLock.ts参照)。 */}
        {streamBadgeLabel(card) && (
          <span className="match-card-stream-badge">
            {streamBadgeLabel(card)}
          </span>
        )}
      </td>
      <td className="match-card-entrants">
        {entrantName(entrantById, card.entrant1Id)} vs{" "}
        {entrantName(entrantById, card.entrant2Id)}
        {card.status === "IN_PROGRESS" && (
          <span className="match-card-status-badge">進行中</span>
        )}
        {card.status === "NOT_STARTED" &&
          !readOnly &&
          !isStreamLocked(card) && (
            <button type="button" onClick={() => onSetInProgress(card.id)}>
              進行中にする
            </button>
          )}
      </td>
      <td>
        {isEditable && tableNumbers.length > 0 && (
          <select
            aria-label={`${card.identifier}の対戦台`}
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
              enforceOccupancy={card.status === "IN_PROGRESS"}
            />
          </select>
        )}
        {!isEditable && card.tableNumber && `卓 ${card.tableNumber}`}
      </td>
      <td>
        {card.status === "COMPLETED" ? (
          <span className="match-card-result">
            勝者: {entrantName(entrantById, card.winnerId)}
            {card.score ? ` (${card.score})` : ""}
            {!readOnly && !isStreamLocked(card) && (
              <MatchCardEdit
                card={card}
                entrantById={entrantById}
                onRecordResult={onRecordResult}
              />
            )}
          </span>
        ) : (
          isEditable &&
          (isBye && byeEntrantId ? (
            <button
              type="button"
              onClick={() => onRecordResult(card.id, byeResult(byeEntrantId))}
            >
              {entrantName(entrantById, byeEntrantId)} の不戦勝で確定
            </button>
          ) : (
            <ScoreEntryForm
              card={card}
              entrantById={entrantById}
              onSubmit={(result) => onRecordResult(card.id, result)}
            />
          ))
        )}
      </td>
    </tr>
  );
}
