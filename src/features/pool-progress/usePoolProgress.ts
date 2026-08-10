import { useCallback, useEffect, useState } from "react";
import type { Attendance, Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { Pool } from "../../domain/entities/pool.js";
import { computeIsLocked } from "../../domain/rules/editLock.js";
import {
  advanceWinner,
  reconcileAdvancement,
} from "../../domain/rules/matchProgression.js";
import {
  type NextMatchSuggestion,
  computeNextMatchSuggestions,
} from "../../domain/rules/nextMatchSuggestion.js";
import { generateRoundRobinMatchCards } from "../../domain/rules/roundRobinGenerator.js";
import { isTableOccupied } from "../../domain/rules/tableAssignment.js";
import { addStaffAssignment } from "../../infra/storage/adminRepository.js";
import { getStartggConfig } from "../../infra/storage/adminRepository.js";
import {
  getEntrantsByPool,
  saveEntrant,
} from "../../infra/storage/entrantRepository.js";
import {
  getMatchCardsByPool,
  saveMatchCard,
  saveMatchCards,
} from "../../infra/storage/matchCardRepository.js";
import { getPool, savePool } from "../../infra/storage/poolRepository.js";
import type { MatchResultSubmission } from "./ScoreEntryForm.js";

interface UsePoolProgressResult {
  loading: boolean;
  poolId: string | null;
  pool: Pool | null;
  entrants: Entrant[];
  matchCards: MatchCard[];
  recordAttendance: (
    entrantId: string,
    attendance: Attendance,
  ) => Promise<void>;
  startAwayPeriod: (entrantId: string, reason: string | null) => Promise<void>;
  endAwayPeriod: (entrantId: string) => Promise<void>;
  recordStaffAssignment: (staffName: string) => Promise<void>;
  recordResult: (
    matchCardId: string,
    result: MatchResultSubmission,
  ) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setTableCount: (tableCount: number | null) => Promise<void>;
  /** 占有中の対戦台であれば何もせずfalseを返す(FR-014)。成功時はtrue。 */
  assignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  /**
   * FR-022: 結果確定直後に自動的に提示される、次戦候補のモーダル用state。
   * FR-025: 「対戦開始」「スキップ」いずれも選ばず閉じた場合はnullに戻す
   * だけで、対戦カードの状態は変更しない。
   */
  nextMatchSuggestion: NextMatchSuggestion | null;
  /** FR-024: サジェストされた対戦を「進行中」に変更する(対戦台番号は任意)。 */
  callSuggestedMatch: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<void>;
  /** FR-020/FR-021: サジェストをスキップし、同じ対戦台へ次の候補を提示する。 */
  skipSuggestion: (matchCardId: string) => Promise<void>;
  /** FR-025: モーダルを何も選ばずに閉じる。 */
  dismissSuggestion: () => void;
  setInProgress: (matchCardId: string) => Promise<void>;
}

/**
 * US2の中核フック。担当プール(FR-010: 1端末=1プール)のPool/Entrant/
 * MatchCardをロードし、全ての書き込みをオンライン/オフラインを問わず
 * まずIndexedDBへ即時コミットする(FR-012, FR-014)。
 */
export function usePoolProgress(): UsePoolProgressResult {
  const [loading, setLoading] = useState(true);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [matchCards, setMatchCards] = useState<MatchCard[]>([]);
  const [nextMatchSuggestion, setNextMatchSuggestion] =
    useState<NextMatchSuggestion | null>(null);

  const reload = useCallback(async (targetPoolId: string) => {
    const [loadedPool, loadedEntrants, rawCards] = await Promise.all([
      getPool(targetPoolId),
      getEntrantsByPool(targetPoolId),
      getMatchCardsByPool(targetPoolId),
    ]);
    // 過去(FR-023のlocalOnly対応より前)に記録された結果が、その後の同期で
    // 後続カードへの反映を上書きされてしまっているケースを自己修復する。
    const loadedCards = reconcileAdvancement(rawCards);
    if (loadedCards.some((card, index) => card !== rawCards[index])) {
      await saveMatchCards(loadedCards);
    }
    setPool(loadedPool ?? null);
    setEntrants(loadedEntrants);
    setMatchCards(loadedCards);
    return { loadedPool, loadedEntrants, loadedCards };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const config = await getStartggConfig();
      if (!config?.poolId) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setPoolId(config.poolId);

      const { loadedPool, loadedEntrants, loadedCards } = await reload(
        config.poolId,
      );

      if (
        !cancelled &&
        loadedPool?.bracketType === "ROUND_ROBIN" &&
        loadedCards.length === 0 &&
        loadedEntrants.length >= 2
      ) {
        const generated = generateRoundRobinMatchCards(
          config.poolId,
          loadedEntrants,
        );
        await saveMatchCards(generated);
        if (!cancelled) setMatchCards(generated);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const recordAttendance = useCallback(
    async (entrantId: string, attendance: Attendance) => {
      const target = entrants.find((entrant) => entrant.id === entrantId);
      if (!target) return;
      const updated: Entrant = {
        ...target,
        attendance,
        attendanceRecordedAt: new Date().toISOString(),
      };
      await saveEntrant(updated);
      setEntrants((prev) =>
        prev.map((entrant) => (entrant.id === entrantId ? updated : entrant)),
      );
    },
    [entrants],
  );

  const startAwayPeriod = useCallback(
    async (entrantId: string, reason: string | null) => {
      const target = entrants.find((entrant) => entrant.id === entrantId);
      if (!target) return;
      const updated: Entrant = {
        ...target,
        awayPeriods: [
          ...target.awayPeriods,
          { startedAt: new Date().toISOString(), endedAt: null, reason },
        ],
      };
      await saveEntrant(updated);
      setEntrants((prev) =>
        prev.map((entrant) => (entrant.id === entrantId ? updated : entrant)),
      );
    },
    [entrants],
  );

  const endAwayPeriod = useCallback(
    async (entrantId: string) => {
      const target = entrants.find((entrant) => entrant.id === entrantId);
      if (!target) return;
      const lastOpenIndex = [...target.awayPeriods]
        .map((period, index) => ({ period, index }))
        .reverse()
        .find(({ period }) => period.endedAt === null)?.index;
      if (lastOpenIndex === undefined) return;
      const awayPeriods = target.awayPeriods.map((period, index) =>
        index === lastOpenIndex
          ? { ...period, endedAt: new Date().toISOString() }
          : period,
      );
      const updated: Entrant = { ...target, awayPeriods };
      await saveEntrant(updated);
      setEntrants((prev) =>
        prev.map((entrant) => (entrant.id === entrantId ? updated : entrant)),
      );
    },
    [entrants],
  );

  const recordStaffAssignment = useCallback(
    async (staffName: string) => {
      if (!poolId || !pool) return;
      await addStaffAssignment({
        poolId,
        staffName,
        recordedAt: new Date().toISOString(),
      });
      const updatedPool: Pool = { ...pool, staffName };
      await savePool(updatedPool);
      setPool(updatedPool);
    },
    [poolId, pool],
  );

  const recordResult = useCallback(
    async (matchCardId: string, result: MatchResultSubmission) => {
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target || target.isLocked) return;
      const updated: MatchCard = {
        ...target,
        entrant1Score: result.entrant1Score,
        entrant2Score: result.entrant2Score,
        entrant1DQ: result.entrant1DQ,
        entrant2DQ: result.entrant2DQ,
        winnerId: result.winnerId,
        score: result.score,
        status: "COMPLETED",
        localOnly: true,
      };
      const replaced = matchCards.map((card) =>
        card.id === matchCardId ? updated : card,
      );
      // 後続の対戦カード(entrant1/entrant2SourceMatchIdでこのカードを出場元
      // として参照しているカード)へ結果を送り込む(FR-023)。同じ側を参照
      // していれば勝者、別の側(勝者側→敗者側)を参照していれば敗者を送る。
      // startgg同期後はstart.gg側で反映されるが、オフラインでの結果入力
      // ではここで自分で反映しないと後続カードがBYEのまま止まって見える。
      const nextCards = advanceWinner(replaced, updated);
      // 後続カードのロック状態を再計算し(FR-022)、変化した全カードを
      // 永続化する(修正対象自身だけでなく、新たにロックされた先行カードも
      // 反映しないと、リロード後にロック状態が失われてしまうため)。
      const relocked = nextCards.map((card) => ({
        ...card,
        isLocked: computeIsLocked(card, nextCards),
      }));
      await saveMatchCards(relocked);
      setMatchCards(relocked);

      // FR-017/FR-022: 結果確定直後、その対戦台(割り当てられていれば)へ
      // 次に呼ぶべき対戦カードを1件、モーダル用stateにセットする。
      const tableCount = pool?.tableCount ?? null;
      const suggestions = computeNextMatchSuggestions(relocked, tableCount);
      const completedTable = updated.tableNumber;
      const forThisTable =
        tableCount != null && tableCount > 0 && completedTable != null
          ? (suggestions.find((s) => s.table === completedTable) ?? null)
          : (suggestions[0] ?? null);
      setNextMatchSuggestion(forThisTable);
    },
    [matchCards, pool],
  );

  const setTableCount = useCallback(
    async (tableCount: number | null) => {
      if (!pool) return;
      const updatedPool: Pool = { ...pool, tableCount };
      await savePool(updatedPool);
      setPool(updatedPool);
    },
    [pool],
  );

  const assignTable = useCallback(
    async (matchCardId: string, tableNumber: string | null) => {
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target) return false;
      if (
        tableNumber !== null &&
        isTableOccupied(tableNumber, matchCards, matchCardId)
      ) {
        return false;
      }
      // 002-match-scoring-and-flow FR-016: 対戦台番号のローカル入力保護は
      // syncRunner.tsのmergeMatchCardが常にtableNumberをローカル優先で
      // マージするため、ここでlocalOnlyを立てる必要はない(結果確定と違い
      // startgg側に送信するものがなく、localOnlyを立てても永久にクリア
      // されない問題を避けるため意図的にそうしている)。
      const updated: MatchCard = { ...target, tableNumber };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
      return true;
    },
    [matchCards],
  );

  const callSuggestedMatch = useCallback(
    async (matchCardId: string, tableNumber: string | null) => {
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target) return;
      const updated: MatchCard = {
        ...target,
        status: "IN_PROGRESS",
        tableNumber: tableNumber ?? target.tableNumber,
      };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
      setNextMatchSuggestion(null);
    },
    [matchCards],
  );

  const skipSuggestion = useCallback(
    async (matchCardId: string) => {
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target) return;
      const updated: MatchCard = { ...target, skippedFromSuggestion: true };
      const nextCards = matchCards.map((card) =>
        card.id === matchCardId ? updated : card,
      );
      await saveMatchCard(updated);
      setMatchCards(nextCards);

      // FR-020: スキップした対戦台へ、別の候補があればすぐに提示し直す。
      const tableCount = pool?.tableCount ?? null;
      const table = nextMatchSuggestion?.table ?? null;
      const suggestions = computeNextMatchSuggestions(nextCards, tableCount);
      const next =
        tableCount != null && tableCount > 0 && table != null
          ? (suggestions.find((s) => s.table === table) ?? null)
          : (suggestions[0] ?? null);
      setNextMatchSuggestion(next);
    },
    [matchCards, pool, nextMatchSuggestion],
  );

  const dismissSuggestion = useCallback(() => {
    setNextMatchSuggestion(null);
  }, []);

  const setInProgress = useCallback(
    async (matchCardId: string) => {
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target || target.status !== "NOT_STARTED") return;
      const updated: MatchCard = { ...target, status: "IN_PROGRESS" };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
    },
    [matchCards],
  );

  const completeOnboarding = useCallback(async () => {
    if (!pool) return;
    const updatedPool: Pool = {
      ...pool,
      onboardingCompletedAt: new Date().toISOString(),
    };
    await savePool(updatedPool);
    setPool(updatedPool);
  }, [pool]);

  return {
    loading,
    poolId,
    pool,
    entrants,
    matchCards,
    recordAttendance,
    startAwayPeriod,
    endAwayPeriod,
    recordStaffAssignment,
    recordResult,
    completeOnboarding,
    setTableCount,
    assignTable,
    nextMatchSuggestion,
    callSuggestedMatch,
    skipSuggestion,
    dismissSuggestion,
    setInProgress,
  };
}
