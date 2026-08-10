import type { MatchCard } from "../entities/matchCard.js";
import { isTableOccupied } from "./tableAssignment.js";

export interface NextMatchSuggestion {
  matchCardId: string;
  /** 対応する対戦台番号。`tableCount`未設定時のフォールバックではnull。 */
  table: string | null;
}

function pickBest(candidates: MatchCard[]): MatchCard | null {
  if (candidates.length === 0) return null;
  // FR-021: skippedFromSuggestionのカードは、他に候補がある間は後回しにする
  // (完全に除外はしない。他が全てスキップ済みならそれを提示する)。
  const notSkipped = candidates.filter((card) => !card.skippedFromSuggestion);
  const pool = notSkipped.length > 0 ? notSkipped : candidates;
  return [...pool].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.identifier.localeCompare(b.identifier);
  })[0];
}

/**
 * FR-017/FR-018/FR-021: 次に呼ぶべき対戦カードのサジェストを計算する。
 * `tableCount`が未設定(null/0)の場合は、対戦台に紐付かない従来の
 * findNextMatchCard(001 FR-009)と同じ優先順位(ラウンド→識別子の昇順、
 * 未着手のみ)で1件だけ返す。`tableCount`が設定されている場合は、空いて
 * いる(isTableOccupiedがfalseを返す)対戦台ごとに1件ずつ割り当てる。
 * 001-pool-progression-trackerの`nextCardIndicator.ts`(`findNextMatchCard`)
 * を置き換える(このロジックに統合する)。
 */
export function computeNextMatchSuggestions(
  matchCards: MatchCard[],
  tableCount: number | null,
): NextMatchSuggestion[] {
  const pending = matchCards.filter((card) => card.status === "NOT_STARTED");
  if (pending.length === 0) {
    return [];
  }

  if (tableCount == null || tableCount <= 0) {
    const best = pickBest(pending);
    return best ? [{ matchCardId: best.id, table: null }] : [];
  }

  const suggestions: NextMatchSuggestion[] = [];
  const alreadySuggested = new Set<string>();
  for (let table = 1; table <= tableCount; table++) {
    const tableNumber = String(table);
    if (isTableOccupied(tableNumber, matchCards)) {
      continue;
    }
    const candidates = pending.filter((card) => !alreadySuggested.has(card.id));
    const best = pickBest(candidates);
    if (best) {
      suggestions.push({ matchCardId: best.id, table: tableNumber });
      alreadySuggested.add(best.id);
    }
  }
  return suggestions;
}
