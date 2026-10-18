import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { Modal } from "../../components/index.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { lockedTooltipText } from "../../domain/rules/editLock.js";
import { foldSide } from "../../domain/rules/matchProgression.js";
import {
  isStreamLocked,
  streamBadgeLabel,
} from "../../domain/rules/streamLock.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";
import { ScoreEntryForm } from "./ScoreEntryForm.js";
import { TableChips } from "./TableChips.js";

interface MatchCardEntryProps {
  card: MatchCard;
  entrantById: Map<string, Entrant>;
  isNext: boolean;
  /** デザイン刷新(2026-10-09): 出欠/離席により次戦候補から外れている「保留」の対戦カード。 */
  isBlocked?: boolean;
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
  /** artifact更新(2026-10-17): 「進行中にする」操作の取り消し。 */
  onSetNotStarted: (matchCardId: string) => void;
  /** FR-023: ブラケット木の中でツリー状に配置するための位置指定。 */
  style?: CSSProperties;
  /**
   * ユーザーフィードバック(2026-08-13): start.gg側でブラケットが未開始
   * (プレビューモード)の間はカードをタップしても編集モーダルを開かない。
   */
  readOnly?: boolean;
}

function entrantName(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "BYE";
  return entrantById.get(id)?.name ?? id;
}

/**
 * ユーザーフィードバック(2026-10-13): 出場者の枠が空(entrantId === null)
 * には2つの異なる意味があり、同じ「BYE」という表示では混同される。
 * - 本当の不戦勝(BYE): この枠に出場元の対戦(sourceMatchId)が無く、
 *   そもそも対戦自体が発生しない(もう片方の出場者が自動的に通過する)。
 * - 未確定: 出場元の対戦(sourceMatchId)がまだ完了していないだけで、
 *   その対戦の結果が決まり次第この枠は埋まる。対戦が無いわけではない。
 * 後者を「BYE」と表示すると対戦が発生しないかのように誤解されるため、
 * artifact(モックアップ)の`placeholder(x) => x.w ? x.w+'の勝者' :
 * x.l+'の敗者'`と同じ考え方で、「{出場元の識別子}の勝者/敗者」と表示する
 * (例: 「Iの敗者」「Pの勝者」)。artifactには出場元を示す別枠の注記
 * (旧「Winners X より」表示)が無く、この枠の文言だけで出場元を示すため、
 * 別途の注記は廃止した(MatchCardList.tsx/BracketBoard.tsx参照)。
 */
function isSlotPending(
  entrantId: string | null,
  sourceMatchId: string | null,
): boolean {
  return entrantId === null && sourceMatchId !== null;
}

function slotDisplayName(
  entrantById: Map<string, Entrant>,
  entrantId: string | null,
  sourceMatchId: string | null,
  card: MatchCard,
  matchCards: MatchCard[],
) {
  if (entrantId) return entrantById.get(entrantId)?.name ?? entrantId;
  if (!isSlotPending(entrantId, sourceMatchId)) return "BYE";
  const sourceCard = matchCards.find((c) => c.id === sourceMatchId);
  if (!sourceCard) return "未定";
  const expectsWinner =
    foldSide(card.bracketSide) === foldSide(sourceCard.bracketSide);
  return expectsWinner
    ? `${sourceCard.identifier}の勝者`
    : `${sourceCard.identifier}の敗者`;
}

function entrantSeed(entrantById: Map<string, Entrant>, id: string | null) {
  if (!id) return "";
  const seed = entrantById.get(id)?.seed;
  return seed ?? "";
}

/**
 * ユーザーフィードバック(2026-10-13): 対戦カードの小さな得点バッジには
 * card.score(start.gg側のdisplayScore、例: "2-0")をそのまま使わない。
 * displayScoreは常に短い書式とは限らず、実機で「Player29 2 - Player36」
 * のように両選手名を含む長い文字列が返ってくるケースが確認され、バッジ
 * からあふれて選手名表示と重なって見える不具合になっていた。
 *
 * 代わりに、このアプリ内で記録した結果(entrant1Score/entrant2Score、
 * 002-match-scoring-and-flowのローカル専用フィールド)から枠ごとの得点を
 * 組み立てる。DQ/不戦勝(W)、またはstart.gg側で直接確定され内訳が
 * 分からない結果は、常に短い固定の文字列("DQ"/"W")のみを返すため、
 * バッジの最大幅が予測可能になる。
 */
function scoreBadgeText(
  card: MatchCard,
  slotKey: "entrant1" | "entrant2",
): string | null {
  if (card.status !== "COMPLETED") return null;
  const entrantId = slotKey === "entrant1" ? card.entrant1Id : card.entrant2Id;
  const isWinner = entrantId !== null && entrantId === card.winnerId;
  const dq = slotKey === "entrant1" ? card.entrant1DQ : card.entrant2DQ;
  if (dq) return "DQ";
  const score =
    slotKey === "entrant1" ? card.entrant1Score : card.entrant2Score;
  if (score !== null) return String(score);
  return isWinner ? "W" : null;
}

/**
 * デザイン刷新(2026-10-09): モックアップの対戦カード状態別見た目
 * (wait/live/next/blocked/done)。「保留」(isBlocked)は呼び出し元
 * (MatchCardList.tsx)が出欠/離席から判定して渡す。
 */
function matchCardVariant(
  card: MatchCard,
  isNext: boolean,
  isBlocked: boolean,
): "done" | "live" | "next" | "blocked" | "wait" | "ready" {
  if (card.status === "COMPLETED") return "done";
  if (card.status === "IN_PROGRESS") return "live";
  if (isNext) return "next";
  if (isBlocked) return "blocked";
  if (!card.entrant1Id || !card.entrant2Id) return "wait";
  return "ready";
}

const VARIANT_LABEL: Record<ReturnType<typeof matchCardVariant>, string> = {
  done: "完了",
  live: "進行中",
  next: "次に進行",
  blocked: "保留",
  wait: "未着手",
  ready: "未着手",
};

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
  isBlocked,
  onRecordResult,
  tableNumbers,
  matchCards,
  onAssignTable,
  onSetInProgress,
  onSetNotStarted,
  style,
  readOnly,
}: MatchCardEntryProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  // artifact更新(2026-10-17): 修正不可の注意書きを鍵マークのツールチップ
  // (クリックで開閉)に出し分けるための開閉状態。
  const [lockTipOpen, setLockTipOpen] = useState(false);
  const isEditable = card.status !== "COMPLETED";
  // ユーザーフィードバック(2026-10-13): 出場元の対戦がまだ完了していない
  // ために枠が空(未定)のカードは、どちらの出場者になるか未確定なため
  // 編集できないようにする(本当の不戦勝(BYEで出場元が無い)とは区別する)。
  const hasPendingSlot =
    isSlotPending(card.entrant1Id, card.entrant1SourceMatchId) ||
    isSlotPending(card.entrant2Id, card.entrant2SourceMatchId);
  const isBye =
    !hasPendingSlot && Boolean(card.entrant1Id) !== Boolean(card.entrant2Id);
  const byeEntrantId = card.entrant1Id ?? card.entrant2Id;
  // 005-stream-match-lock FR-002〜FR-004: 配信台が設定されている対戦
  // カードは、状態(未着手・進行中・確定済み)を問わず一切編集できない
  // (新規入力・修正のどちらのモーダルもこのcanEditで一括して開閉を
  // 制御しているため、ここ1箇所のガードで両方をブロックできる)。
  const canEdit =
    !readOnly &&
    (isEditable || !card.isLocked) &&
    !isStreamLocked(card) &&
    !hasPendingSlot;
  const variant = matchCardVariant(card, isNext, Boolean(isBlocked));
  const tableLabel = card.tableNumber ? `卓 ${card.tableNumber}` : "卓 —";
  // artifact更新(2026-10-17): 修正不可の注意書きは、モックアップの鍵マーク
  // (クリックで開閉するツールチップ)で示す。表示条件は旧来の静的な
  // 注意書きと同じ(確定済み・かつ後続の対戦が進行済みのカードのみ)。
  const isLockedForEdit = !isEditable && card.isLocked;

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
        `match-card-${variant}`,
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
      <span className="match-card-side-id mono">{card.identifier}</span>
      <span className="match-card-box">
        <div className="match-card-players">
          {(
            [
              ["entrant1", card.entrant1Id, card.entrant1SourceMatchId],
              ["entrant2", card.entrant2Id, card.entrant2SourceMatchId],
            ] as const
          ).map(([slotKey, entrantId, sourceMatchId]) => {
            const badge = scoreBadgeText(card, slotKey);
            return (
              <div
                className={playerStateClassName(card, entrantId)}
                key={slotKey}
              >
                <span className="match-card-player-seed">
                  {entrantSeed(entrantById, entrantId)}
                </span>
                <span className="match-card-player-name">
                  <span>
                    {slotDisplayName(
                      entrantById,
                      entrantId,
                      sourceMatchId,
                      card,
                      matchCards,
                    )}
                  </span>
                </span>
                <span className="match-card-player-score">{badge ?? ""}</span>
              </div>
            );
          })}
        </div>
        <div className="match-card-meta-row">
          <span className="mono">{tableLabel}</span>
          <span className="match-card-meta-state">
            {VARIANT_LABEL[variant]}
          </span>
          {/* 005-stream-match-lock FR-007: 対戦カードの状態を問わず表示する。
              ユーザーフィードバック(2026-10-16): 未着手なら「配信予定」、
              進行中・確定済みなら「配信中」を出し分ける(streamLock.ts参照)。 */}
          {streamBadgeLabel(card) && (
            <span className="match-card-stream-badge">
              {streamBadgeLabel(card)}
            </span>
          )}
          {canEdit && (
            <span className="match-card-edit-icon" aria-hidden="true">
              ✏️
            </span>
          )}
          {isLockedForEdit && (
            <button
              type="button"
              className="match-card-lock"
              aria-label="結果は確定済み（修正不可）。理由を表示"
              aria-expanded={lockTipOpen}
              onClick={() => setLockTipOpen((open) => !open)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="10" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </button>
          )}
        </div>
      </span>
      {isLockedForEdit && lockTipOpen && (
        // 鍵マーク(操作対象)で既に開閉できるため、ここはタップで閉じる
        // だけの追加の便宜(モックアップの.tip onClick=closeTipと同じ)。
        // biome-ignore lint/a11y/useKeyWithClickEvents: 閉じる操作は鍵マーク自体でも可能
        <div
          className="match-card-lock-tip"
          role="tooltip"
          onClick={() => setLockTipOpen(false)}
        >
          {lockedTooltipText(card, matchCards)}
        </div>
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
                {/* ユーザーフィードバック(2026-10-17): 進行中にした後も
                    「未着手」へ押し戻せるようにする(start.ggへまだ反映
                    されていない間はsetNotStartedが取り消せる。反映済みの
                    場合は内部で何もしない)。あわせて、進行中の対戦を
                    開いたときにも現在の状態が分かるよう、未着手・進行中の
                    いずれでもこの区画自体は表示する(artifactのshowState:
                    canScore && stt !== 'done'と同じ条件)。横幅いっぱいに
                    広がった枠の中で左右均等に分かれるよう、2等分グリッドの
                    .seg2をartifactに合わせて追加する。 */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 18 }}
                >
                  {(card.status === "NOT_STARTED" ||
                    card.status === "IN_PROGRESS") && (
                    <div className="msec">
                      <span className="label">状態</span>
                      <fieldset className="seg seg2" aria-label="状態">
                        <legend className="sr-only">状態</legend>
                        <button
                          type="button"
                          className={card.status === "NOT_STARTED" ? "on" : ""}
                          aria-pressed={card.status === "NOT_STARTED"}
                          onClick={() => onSetNotStarted(card.id)}
                        >
                          未着手
                        </button>
                        <button
                          type="button"
                          className={card.status === "IN_PROGRESS" ? "on" : ""}
                          aria-pressed={card.status === "IN_PROGRESS"}
                          onClick={() => onSetInProgress(card.id)}
                        >
                          進行中
                        </button>
                      </fieldset>
                    </div>
                  )}
                  {tableNumbers.length > 0 && (
                    <TableChips
                      card={card}
                      tableNumbers={tableNumbers}
                      matchCards={matchCards}
                      onAssignTable={onAssignTable}
                    />
                  )}
                </div>
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
