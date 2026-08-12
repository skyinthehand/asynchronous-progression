import type { MatchCard } from "../entities/matchCard.js";
import { computeBracketLayout } from "./bracketLayout.js";
import { computeMatchDistances } from "./matchDistance.js";
import { isTableOccupied } from "./tableAssignment.js";

export interface NextMatchSuggestion {
  matchCardId: string;
  /** 対応する対戦台番号。`tableNumbers`未設定時のフォールバックではnull。 */
  table: string | null;
}

/**
 * FR-001: 出場者の両方の枠が確定していない対戦カード(先行する対戦の
 * 結果待ちの対戦、および不戦勝(BYE)によって片方の枠にしか対戦相手が
 * 存在しない対戦を含む)は、理由を問わず次戦候補の対象外とする。
 */
function isEligible(card: MatchCard): boolean {
  return (
    card.status === "NOT_STARTED" &&
    card.entrant1Id !== null &&
    card.entrant2Id !== null
  );
}

/** bracketLayout.tsが算出する組合せ図上の縦位置(slot)を対戦カードIDで引けるようにする(FR-006)。 */
function buildSlotByCardId(matchCards: MatchCard[]): Map<string, number> {
  const slotByCardId = new Map<string, number>();
  for (const sideLayout of computeBracketLayout(matchCards)) {
    for (const layoutsInRound of sideLayout.matchesByRound.values()) {
      for (const entry of layoutsInRound) {
        slotByCardId.set(entry.card.id, entry.slot);
      }
    }
  }
  return slotByCardId;
}

/**
 * 適格な候補同士の優先順位を比較する(FR-004〜FR-006)。distancesが
 * 空(総当り等、勝敗ブラケット形式ではないプール)の場合は、この比較は
 * 実質的にスキップされ、既存のround→identifierフォールバックのみが
 * 適用される(FR-008)。
 */
function compareByPriority(
  a: MatchCard,
  b: MatchCard,
  distances: Map<string, number>,
  slotByCardId: Map<string, number>,
): number {
  const distanceA = distances.get(a.id);
  const distanceB = distances.get(b.id);
  if (distanceA !== undefined && distanceB !== undefined) {
    if (distanceA !== distanceB) {
      return distanceB - distanceA; // 遠さの値が大きい対戦を優先
    }
    const aIsLosers = a.bracketSide === "LOSERS";
    const bIsLosers = b.bracketSide === "LOSERS";
    if (aIsLosers !== bIsLosers) {
      return aIsLosers ? -1 : 1; // 遠さが等しければ敗者側を優先
    }
    const slotA = slotByCardId.get(a.id);
    const slotB = slotByCardId.get(b.id);
    if (slotA !== undefined && slotB !== undefined && slotA !== slotB) {
      return slotA - slotB; // 組合せ図上でより上(slotが小さい)を優先
    }
  }
  if (a.round !== b.round) return a.round - b.round;
  return a.identifier.localeCompare(b.identifier);
}

function pickBest(
  candidates: MatchCard[],
  distances: Map<string, number>,
  slotByCardId: Map<string, number>,
): MatchCard | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) =>
    compareByPriority(a, b, distances, slotByCardId),
  )[0];
}

/**
 * FR-001〜FR-009: 次に呼ぶべき対戦カードのサジェストを計算する。出場者の
 * 両方の枠が確定していない対戦(不戦勝(BYE)を含む)は候補から除外し
 * (FR-001)、勝敗ブラケット形式のプールでは「プール抜けを決定づける対戦
 * からの遠さ」(matchDistance.ts)が大きい対戦を優先、遠さが同じなら
 * 敗者側を優先(FR-005)、さらに同じなら組合せ図上でより上に表示されて
 * いる対戦を優先する(FR-006、bracketLayout.tsのslotを再利用)。総当り
 * 形式のプールでは、この優先順位規則を適用せず既存のround→identifier
 * フォールバックを維持する(FR-008)。`tableNumbers`が未設定(空配列)の
 * 場合も同じ優先順位規則で1件だけ返す(FR-009)。
 * 001-pool-progression-trackerの`nextCardIndicator.ts`(`findNextMatchCard`)
 * を置き換える(このロジックに統合する)。
 */
export function computeNextMatchSuggestions(
  matchCards: MatchCard[],
  tableNumbers: string[],
): NextMatchSuggestion[] {
  const pending = matchCards.filter(isEligible);
  if (pending.length === 0) {
    return [];
  }

  const distances = computeMatchDistances(matchCards);
  const slotByCardId = buildSlotByCardId(matchCards);

  if (tableNumbers.length === 0) {
    const best = pickBest(pending, distances, slotByCardId);
    return best ? [{ matchCardId: best.id, table: null }] : [];
  }

  const suggestions: NextMatchSuggestion[] = [];
  const alreadySuggested = new Set<string>();
  for (const tableNumber of tableNumbers) {
    if (isTableOccupied(tableNumber, matchCards)) {
      continue;
    }
    const candidates = pending.filter((card) => !alreadySuggested.has(card.id));
    const best = pickBest(candidates, distances, slotByCardId);
    if (best) {
      suggestions.push({ matchCardId: best.id, table: tableNumber });
      alreadySuggested.add(best.id);
    }
  }
  return suggestions;
}
