import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { Pool } from "../../domain/entities/pool.js";
import {
  computeBlockedMatches,
  computeNextMatchSuggestions,
} from "../../domain/rules/nextMatchSuggestion.js";
import { BracketBoard } from "./BracketBoard.js";
import { MatchTable } from "./MatchTable.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";

interface MatchCardListProps {
  pool: Pool | null;
  matchCards: MatchCard[];
  entrants: Entrant[];
  onRecordResult: (matchCardId: string, result: MatchResultSubmission) => void;
  onAssignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  onSetInProgress: (matchCardId: string) => void;
  /**
   * artifact更新(2026-10-17): 「進行中にする」操作の取り消し。ブラケット
   * 表示(組合せ図)でのみ使う(総当り表(MatchTable)は到達不能パスのため
   * 対象外)。
   */
  onSetNotStarted: (matchCardId: string) => void;
  readOnly?: boolean;
}

/**
 * FR-007/FR-009/FR-023: 対戦カード一覧の表示・結果入力・次カードの強調
 * 表示。`bracketType` に応じ、startggのブラケット表示に合わせた列形式
 * (勝者側/敗者側トーナメント)か、対戦表形式(総当りなど)かを切り替える
 * (印刷用レイアウトと同じ方針)。デザイン刷新(2026-10-09): 「ブラケット」
 * タブの内容としてPoolProgressScreen.tsxから呼ばれる(見出しはタブ側が
 * 持つため、ここでは中身のみを返す)。
 */
export function MatchCardList({
  pool,
  matchCards,
  entrants,
  onRecordResult,
  onAssignTable,
  onSetInProgress,
  onSetNotStarted,
  readOnly,
}: MatchCardListProps) {
  const entrantById = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const tableNumbers = pool?.tableNumbers ?? [];
  // FR-017/FR-018/FR-026: 対戦台単位(複数)の次戦候補を、一覧・組合せ図の
  // 強調表示にそのまま使う(001の findNextMatchCard を置き換え)。
  const nextCardIds = new Set(
    computeNextMatchSuggestions(matchCards, tableNumbers, entrants).map(
      (suggestion) => suggestion.matchCardId,
    ),
  );
  const blockedCardIds = new Set(
    computeBlockedMatches(matchCards, entrants, nextCardIds).map(
      (blocked) => blocked.matchCardId,
    ),
  );
  const hasBracket =
    pool?.bracketType === "SINGLE_ELIMINATION" ||
    pool?.bracketType === "DOUBLE_ELIMINATION";

  if (matchCards.length === 0) {
    return <p>対戦カードがまだありません。</p>;
  }

  return hasBracket ? (
    <BracketBoard
      matchCards={matchCards}
      entrantById={entrantById}
      nextCardIds={nextCardIds}
      blockedCardIds={blockedCardIds}
      onRecordResult={onRecordResult}
      tableNumbers={tableNumbers}
      onAssignTable={onAssignTable}
      onSetInProgress={onSetInProgress}
      onSetNotStarted={onSetNotStarted}
      readOnly={readOnly}
    />
  ) : (
    <MatchTable
      matchCards={matchCards}
      entrantById={entrantById}
      nextCardIds={nextCardIds}
      onRecordResult={onRecordResult}
      tableNumbers={tableNumbers}
      onAssignTable={onAssignTable}
      onSetInProgress={onSetInProgress}
      readOnly={readOnly}
    />
  );
}
