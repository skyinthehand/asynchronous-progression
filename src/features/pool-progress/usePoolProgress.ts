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
import { computeIsPreviewMode } from "../../domain/rules/previewMode.js";
import { generateRoundRobinMatchCards } from "../../domain/rules/roundRobinGenerator.js";
import { isStreamLocked } from "../../domain/rules/streamLock.js";
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

/**
 * ユーザーフィードバック(2026-10-15): バックグラウンド同期
 * (useSyncScheduler、60秒間隔)はIndexedDBを正しく更新しているのに、
 * この画面の表示(pool/entrants/matchCards)はマウント時に1度読み込んだ
 * きり再読込されず、同期状態チップ(useSyncStatus.tsが別途5秒間隔で
 * ポーリング)だけが「同期済み」と進む一方で画面の中身が反映されない、
 * という報告のバグ修正。同じ間隔で画面側もIndexedDBから読み直す。
 */
const RELOAD_POLL_INTERVAL_MS = 5_000;

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
  /** 占有中の対戦台であれば何もせずfalseを返す(FR-014)。成功時はtrue。 */
  assignTable: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<boolean>;
  /**
   * FR-017/FR-018/FR-026: 対戦台単位(複数)に、現在提示できる次戦候補の
   * 一覧。対戦カード一覧・組合せ図の強調表示(MatchCardList.tsx)と同じ
   * 計算を、モーダルに表示する候補の判定にも用いる。
   */
  nextMatchSuggestions: NextMatchSuggestion[];
  /**
   * FR-022: 結果確定直後、次戦候補が1件以上あれば自動的にtrueになる。
   * ユーザーフィードバック: 結果確定によって複数の対戦が同時に進行可能に
   * なった場合、「対戦開始」を押すたびに残りの候補へ自動的に進む(全て
   * 表示し終えるか閉じるまでモーダルが開いたまま)。ただしモーダルを
   * 何も選ばずに閉じた場合は、残りの候補があっても自動では再表示しない
   * (「次戦候補」ボタン(openSuggestionModal)から手動で開き直す)。
   */
  suggestionModalOpen: boolean;
  /** 次戦候補が残っている場合に、モーダルを手動で開き直す(ツールバーの「次戦候補」ボタン用)。 */
  openSuggestionModal: () => void;
  /** FR-024: サジェストされた対戦を「進行中」に変更する(対戦台番号は任意)。 */
  callSuggestedMatch: (
    matchCardId: string,
    tableNumber: string | null,
  ) => Promise<void>;
  /** FR-025: モーダルを何も選ばずに閉じる。 */
  dismissSuggestion: () => void;
  setInProgress: (matchCardId: string) => Promise<void>;
  /**
   * artifact更新(2026-10-17): 「進行中にする」操作の取り消し。start.ggへ
   * まだ反映されていない(statusLocalOnly)間に限って「未着手」へ戻せる
   * (既に反映済みの場合は、start.gg側に取り消すAPIが無いため、戻すと
   * 次回同期でstart.gg側の値に上書きされ元に戻ってしまう。そのため
   * 反映済みの場合は何もしない)。
   */
  setNotStarted: (matchCardId: string) => Promise<void>;
  /**
   * ユーザーフィードバック(2026-08-13): start.gg側でブラケットが未開始
   * (対戦カードのIDがpreview形式)の間は結果入力・対戦台変更・進行中
   * 設定を一切できないようにする(開始後にIDが実IDへ切り替わった際の
   * ローカルデータ孤立を、そもそも記録させないことで回避する)。
   */
  isPreviewMode: boolean;
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
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  // MatchCardList.tsxの強調表示と同じ計算を都度そのまま使う(専用のstateに
  // 保持しない。永続化された対戦カード一覧から常に導出可能なため)。
  const nextMatchSuggestions = computeNextMatchSuggestions(
    matchCards,
    pool?.tableNumbers ?? [],
    entrants,
  );
  const isPreviewMode = computeIsPreviewMode(matchCards);

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

  useEffect(() => {
    if (!poolId) return;
    const intervalId = setInterval(() => {
      void reload(poolId);
    }, RELOAD_POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [poolId, reload]);

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
      if (isPreviewMode) return;
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target || target.isLocked) return;
      // 005-stream-match-lock FR-004: 配信台が設定されている対戦カードは
      // 新規確定・結果修正のいずれも不可(このrecordResultは両方から
      // 共通して呼ばれるため、ここ1箇所のガードで両方をブロックできる)。
      if (isStreamLocked(target)) return;
      const updated: MatchCard = {
        ...target,
        entrant1Score: result.entrant1Score,
        entrant2Score: result.entrant2Score,
        entrant1DQ: result.entrant1DQ,
        entrant2DQ: result.entrant2DQ,
        entrant1W: result.entrant1W,
        entrant2W: result.entrant2W,
        winnerId: result.winnerId,
        score: result.score,
        status: "COMPLETED",
        localOnly: true,
        // 結果確定によりステータスはCOMPLETEDへ確定するため、進行中送信
        // (statusLocalOnly)は不要になる。M1(reportMatchResult)の送信で
        // status/scoreはまとめて反映されるため、ここで残しておくと
        // markSetInProgressへの無意味な再送信が発生してしまう。
        statusLocalOnly: false,
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

      // FR-017/FR-022: 結果確定直後、次戦候補が1件以上あればモーダルを
      // 開く。結果確定によって複数の対戦台分の候補が同時に進行可能になる
      // 場合もあるため、対戦台単位の件数に関わらずここでは「1件以上
      // あるか」だけを判定し、実際にどれを表示するかはnextMatchSuggestions
      // (常に対戦カード一覧から都度導出)を参照する。
      const suggestions = computeNextMatchSuggestions(
        relocked,
        pool?.tableNumbers ?? [],
        entrants,
      );
      setSuggestionModalOpen(suggestions.length > 0);
    },
    [matchCards, pool, isPreviewMode, entrants],
  );

  const assignTable = useCallback(
    async (matchCardId: string, tableNumber: string | null) => {
      if (isPreviewMode) return false;
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target) return false;
      // 005-stream-match-lock FR-003: 配信台が設定されている対戦カードは
      // 対戦台の割り当て・変更を不可にする。
      if (isStreamLocked(target)) return false;
      // ユーザーフィードバック(2026-10-19): 占有中判定は、このカード自身が
      // 進行中の場合のみ適用する(進行中同士で同じ対戦台を選んだ場合のみ
      // ブロックする。未着手のカードは全ての対戦台から自由に選べる)。
      if (
        tableNumber !== null &&
        target.status === "IN_PROGRESS" &&
        isTableOccupied(tableNumber, matchCards, matchCardId)
      ) {
        return false;
      }
      // ユーザーフィードバック(2026-10-19): 対戦台番号はローカルに保存する
      // だけでは不十分で、start.gg側のstationにも反映する必要がある
      // (反映しないと「対戦台の情報がstartggに反映されない」)。
      // tableLocalOnlyは対戦台の送信待ちだけを示す専用フラグ(statusLocal
      // Onlyとは独立。既にIN_PROGRESSな対戦カードに対戦台だけ変更する
      // ケースで、statusLocalOnlyを流用すると不要なmarkSetInProgressが
      // 「Set is already started」で失敗し、その巻き添えで対戦台の送信
      // 自体が行われなくなる不具合があったため分離した)。
      const updated: MatchCard = {
        ...target,
        tableNumber,
        tableLocalOnly: true,
      };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
      return true;
    },
    [matchCards, isPreviewMode],
  );

  const callSuggestedMatch = useCallback(
    async (matchCardId: string, tableNumber: string | null) => {
      if (isPreviewMode) return;
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target) return;
      // 005-stream-match-lock: 配信台が設定されている対戦は、そもそも
      // 次戦候補(nextMatchSuggestion.ts)の対象から除外されるため通常は
      // ここに来ないが、念のための安全弁として同様にガードする。
      if (isStreamLocked(target)) return;
      const updated: MatchCard = {
        ...target,
        status: "IN_PROGRESS",
        tableNumber: tableNumber ?? target.tableNumber,
        // ユーザーフィードバック(2026-08-13): 進行中への変更・対戦台番号を
        // startgg側にも反映できるようにする(syncRunner.tsのrunSyncが
        // markSetInProgress/assignStationToSetで送信するまでのキュー)。
        // この操作は状態と対戦台を同時に変更するため、両方のフラグを立てる。
        statusLocalOnly: true,
        tableLocalOnly: true,
      };
      const nextCards = matchCards.map((card) =>
        card.id === matchCardId ? updated : card,
      );
      await saveMatchCard(updated);
      setMatchCards(nextCards);

      // ユーザーフィードバック: 「対戦開始」を押した場合のみ、残りの次戦
      // 候補があれば続けてモーダルに表示する(閉じた場合は自動再表示
      // しない、dismissSuggestion参照)。
      const remaining = computeNextMatchSuggestions(
        nextCards,
        pool?.tableNumbers ?? [],
        entrants,
      );
      setSuggestionModalOpen(remaining.length > 0);
    },
    [matchCards, pool, isPreviewMode, entrants],
  );

  const dismissSuggestion = useCallback(() => {
    setSuggestionModalOpen(false);
  }, []);

  const openSuggestionModal = useCallback(() => {
    setSuggestionModalOpen(true);
  }, []);

  const setInProgress = useCallback(
    async (matchCardId: string) => {
      if (isPreviewMode) return;
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target || target.status !== "NOT_STARTED") return;
      // 005-stream-match-lock FR-002: 配信台が設定されている対戦カードは
      // 「進行中にする」操作を不可にする。
      if (isStreamLocked(target)) return;
      const updated: MatchCard = {
        ...target,
        status: "IN_PROGRESS",
        statusLocalOnly: true,
      };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
    },
    [matchCards, isPreviewMode],
  );

  const setNotStarted = useCallback(
    async (matchCardId: string) => {
      if (isPreviewMode) return;
      const target = matchCards.find((card) => card.id === matchCardId);
      if (!target || target.status !== "IN_PROGRESS") return;
      // start.ggへ既に反映済み(statusLocalOnlyがfalse)の場合は、取り消す
      // APIが無いため何もしない(次回同期でstart.gg側の値に上書きされ、
      // 元に戻ってしまうのを防ぐ)。
      if (!target.statusLocalOnly) return;
      const updated: MatchCard = {
        ...target,
        status: "NOT_STARTED",
        statusLocalOnly: false,
      };
      await saveMatchCard(updated);
      setMatchCards((prev) =>
        prev.map((card) => (card.id === matchCardId ? updated : card)),
      );
    },
    [matchCards, isPreviewMode],
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
    assignTable,
    nextMatchSuggestions,
    suggestionModalOpen,
    openSuggestionModal,
    callSuggestedMatch,
    dismissSuggestion,
    setInProgress,
    setNotStarted,
    isPreviewMode,
  };
}
