import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { reconcileAdvancement } from "../../domain/rules/matchProgression.js";
import { computePoolFinished } from "../../domain/rules/poolFinished.js";
import { isPreviewSetId } from "../../domain/rules/previewId.js";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  assignStationToSet,
  buildReportBracketSetInput,
  fetchNextMatch,
  fetchPoolDetail,
  fetchStations,
  markSetInProgress,
  reportMatchResult,
} from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  getSyncStatus,
  saveSyncStatus,
} from "../../infra/storage/adminRepository.js";
import {
  getEntrantsByPool,
  saveEntrants,
} from "../../infra/storage/entrantRepository.js";
import {
  getMatchCardsByPool,
  getPendingMatchCards,
  saveMatchCard,
  saveMatchCards,
} from "../../infra/storage/matchCardRepository.js";
import { getPool, savePool } from "../../infra/storage/poolRepository.js";
import { syncNotice } from "../notice/noticeSync.js";
import { deriveIsStale } from "./syncStatusRules.js";

/**
 * ローカル/リモートの対戦カードのマージ規則(FR-016の対戦台番号保護、
 * スコア/DQ等のローカル専用フィールド保護を含む)。`runSync`内部でのみ
 * 使うが、マージ規則自体はtests/integration/features/table-assignment.test.tsx
 * から直接検証できるようexportする。
 */
export function mergeMatchCard(
  local: MatchCard | undefined,
  remote: MatchCard,
): MatchCard {
  if (!local) return remote;
  if (local.localOnly) {
    // ユーザーフィードバック(2026-08-15): 結果(勝者)を保持しているカード
    // (M1未送信のもの)は、送信が成功するまでローカルを正とする。
    // 一方、advanceWinner(matchProgression.ts)による出場者反映のみ
    // (winnerIdを持たない)のカードは、startgg側が追いつけば
    // (remoteの出場者がローカルと一致すれば)保護を解除してよい。
    // これを行わないと、一度でもadvanceWinnerで出場者が反映された
    // カードは、startgg側が実際には追いついていても永久にlocalOnlyの
    // ままとなり、「未反映N件」が減らず、かつそのカードへの以降の
    // remote更新(対戦台・結果修正等)も一切取り込まれなくなってしまう
    // (実際に報告されたバグ: startgg側は最新なのに同期エラーが続く)。
    const remoteCaughtUpWithAdvancement =
      !local.winnerId &&
      remote.entrant1Id === local.entrant1Id &&
      remote.entrant2Id === local.entrant2Id;
    if (!remoteCaughtUpWithAdvancement) {
      return local;
    }
  }
  return {
    ...remote,
    editHistory: local.editHistory,
    isLocked: local.isLocked,
    // 002-match-scoring-and-flow FR-016: 対戦台番号はローカル入力を常に
    // 優先する(ローカルで未設定(null)の場合のみstartgg側のstation値を
    // 使う)。localOnlyのクリア後(結果確定の同期完了後)も、対戦台番号
    // だけが古い値に巻き戻らないようにするため、localOnlyの状態に関わらず
    // ここで常に判定する。
    tableNumber: local.tableNumber ?? remote.tableNumber,
    // entrant1Score/entrant2Score/DQ/Wは本feature独自のローカル入力専用
    // フィールドで、start.gg側に対応する概念がなくfetchPoolDetail()は常に
    // 既定値(null/false)を返す。localOnlyのクリア後にこのデフォルト値で
    // ローカルの記録を上書きしないよう、常にローカル値をそのまま維持する。
    entrant1Score: local.entrant1Score,
    entrant2Score: local.entrant2Score,
    entrant1DQ: local.entrant1DQ,
    entrant2DQ: local.entrant2DQ,
    entrant1W: local.entrant1W,
    entrant2W: local.entrant2W,
    // ユーザーフィードバック(2026-08-13): 「進行中にする」操作で設定した
    // ステータスも、送信(M2/M3)が完了するまではstartgg側の古い値
    // (NOT_STARTED等)で上書きされないよう、tableNumberと同様に常に
    // ローカル優先で判定する。
    status: local.statusLocalOnly ? local.status : remote.status,
    statusLocalOnly: local.statusLocalOnly,
  };
}

function mergeEntrant(local: Entrant | undefined, remote: Entrant): Entrant {
  if (!local) return remote;
  return {
    ...remote,
    attendance: local.attendance,
    attendanceRecordedAt: local.attendanceRecordedAt,
    awayPeriods: local.awayPeriods,
    poolFinished: local.poolFinished,
    nextMatch: local.nextMatch,
  };
}

export interface SyncResult {
  success: boolean;
  /** 呼び出し元(初回同期のUI表示等)向けの失敗理由。成功時はundefined。 */
  error?: string;
}

/**
 * FR-015/FR-017: 未反映のローカル結果をstartggへ送信し(M1)、対象プールの
 * 最新状態(Q2)と注意書き(Q4)を取得してローカルへ反映する。失敗しても
 * ローカルデータは一切変更せず、SyncStatusに失敗を記録するのみ(例外は
 * 投げない。バックグラウンドスケジューラからの呼び出しでも安全なように、
 * 成否は戻り値で判定できるようにする)。
 */
export async function runSync(): Promise<SyncResult> {
  const config = await getStartggConfig();
  if (!config?.poolId || !config.syncToken) {
    return { success: false, error: "対象プールまたはトークンが未設定です" };
  }
  const poolId = config.poolId;
  const tournamentSlug = config.tournamentSlug;

  try {
    const client = createStartggClient(config.syncToken);

    // ユーザーフィードバック(2026-08-13): 1件の送信失敗(特にpreview ID
    // への送信)が同期処理全体(他の対戦の送信・以降のfetchPoolDetail)を
    // 中断させ、「未反映N件」が減らず溜まり続ける原因になっていた。
    // 各カードを個別に試行し、失敗を蓄積して次のカードへ処理を継続する。
    const pending = await getPendingMatchCards(poolId);
    const pushErrors: string[] = [];

    // ユーザーフィードバック(2026-08-13): 「進行中にする」操作の対戦台
    // 番号(単純な数値ラベル)をstartggのassignStationへ渡すには、station
    // idが必要。対戦台番号→station idの対応表は、statusLocalOnlyの
    // カードが実際にある場合のみ(かつ1回だけ)取得する。
    let stationIdByNumber: Map<string, string> | null = null;
    async function resolveStationId(number: string): Promise<string | null> {
      if (!tournamentSlug) return null;
      if (stationIdByNumber === null) {
        const stations = await fetchStations(client, tournamentSlug);
        stationIdByNumber = new Map(
          stations.map((station) => [station.number, station.stationId]),
        );
      }
      return stationIdByNumber.get(number) ?? null;
    }

    for (const card of pending) {
      if (isPreviewSetId(card.id)) {
        // start.gg側でブラケットがまだ「開始」されておらず、実IDが
        // 割り当てられていない状態(FR: プレビューモード)。エラーには
        // せず、開始後の同期で改めて送信されるのを待つ。
        continue;
      }

      if (card.localOnly && card.winnerId) {
        try {
          const outcome = await reportMatchResult(
            client,
            buildReportBracketSetInput(card),
          );
          await saveMatchCard({
            ...card,
            winnerId: outcome.winnerId ?? card.winnerId,
            score: outcome.score ?? card.score,
            status: outcome.status,
            localOnly: false,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          pushErrors.push(`${card.identifier}: ${reason}`);
        }
      }

      if (card.statusLocalOnly) {
        // ユーザーフィードバック(2026-08-13): 対戦を「進行中にする」際、
        // ステータス(M2: markSetInProgress)と対戦台番号(M3:
        // assignStation)をstartgg側にも反映する。対戦台番号が
        // ローカル独自の値でstart.gg側に対応するstationが存在しない
        // 場合は、そのカードのstation割り当てだけを諦める(エラーには
        // しない。markSetInProgress自体は送信済みなのでstatusLocalOnly
        // はクリアする)。
        try {
          if (card.status === "IN_PROGRESS") {
            await markSetInProgress(client, card.id);
          }
          if (card.tableNumber !== null) {
            const stationId = await resolveStationId(card.tableNumber);
            if (stationId) {
              await assignStationToSet(client, card.id, stationId);
            }
          }
          await saveMatchCard({ ...card, statusLocalOnly: false });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          pushErrors.push(`${card.identifier}: ${reason}`);
        }
      }
    }

    const detail = await fetchPoolDetail(client, poolId);
    const [localEntrants, localCards] = await Promise.all([
      getEntrantsByPool(poolId),
      getMatchCardsByPool(poolId),
    ]);
    const localEntrantById = new Map(
      localEntrants.map((entrant) => [entrant.id, entrant]),
    );
    const localCardById = new Map(localCards.map((card) => [card.id, card]));

    const mergedCardsBeforeReconcile = detail.matchCards.map((remote) =>
      mergeMatchCard(localCardById.get(remote.id), remote),
    );
    // 念のための保険: mergeMatchCardの判定を万一すり抜けて後続カードへの
    // 反映が古い値で上書きされてしまっても、確定済みの対戦から結果を
    // 再適用して直す(matchProgression.tsのreconcileAdvancement参照)。
    const mergedCards = reconcileAdvancement(mergedCardsBeforeReconcile);
    const mergedEntrantsBeforeNextMatch = detail.entrants.map((remote) =>
      mergeEntrant(localEntrantById.get(remote.id), remote),
    );

    // FR-018/FR-019: プールを終えた選手について、次戦(後続フェーズ配置)を
    // Q3で取得しキャッシュしておく(オフライン時にも表示できるように)。
    const mergedEntrants = await Promise.all(
      mergedEntrantsBeforeNextMatch.map(async (entrant) => {
        const poolFinished = computePoolFinished(entrant.id, mergedCards);
        if (!poolFinished) {
          return { ...entrant, poolFinished };
        }
        if (entrant.nextMatch?.confirmed) {
          return { ...entrant, poolFinished };
        }
        try {
          const nextMatch = await fetchNextMatch(client, entrant.id);
          return { ...entrant, poolFinished, nextMatch };
        } catch {
          return { ...entrant, poolFinished };
        }
      }),
    );

    if (mergedEntrants.length > 0) {
      await saveEntrants(mergedEntrants);
    }
    if (mergedCards.length > 0) {
      await saveMatchCards(mergedCards);
    }

    const pool = await getPool(poolId);
    if (pool) {
      await savePool({
        ...pool,
        bracketType: detail.bracketType,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    try {
      await syncNotice();
    } catch {
      // 注意書き同期の失敗は対戦進行の同期を妨げない。
    }

    if (pushErrors.length === 0) {
      await saveSyncStatus({
        poolId,
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: (await getSyncStatus(poolId))?.lastFailureAt ?? null,
        lastFailureReason: null,
        pendingChangeCount: 0,
        isStale: false,
      });
      return { success: true };
    }

    // 送信自体に失敗した項目がある場合: 取得・マージ・保存は完了して
    // いるが、この同期サイクルは「完全な成功」ではないため
    // lastSuccessAtは更新しない(deriveIsStaleの「最終成功からの経過
    // 時間」判定を、preview ID待ちの正常な保留と区別するため)。
    const previousOnPushFailure = await getSyncStatus(poolId);
    const pendingCountOnPushFailure = (await getPendingMatchCards(poolId))
      .length;
    const failureAtOnPushFailure = new Date().toISOString();
    const reason = pushErrors.join(" / ");
    await saveSyncStatus({
      poolId,
      lastSuccessAt: previousOnPushFailure?.lastSuccessAt ?? null,
      lastFailureAt: failureAtOnPushFailure,
      lastFailureReason: reason,
      pendingChangeCount: pendingCountOnPushFailure,
      isStale: deriveIsStale({
        lastSuccessAt: previousOnPushFailure?.lastSuccessAt ?? null,
        lastFailureAt: failureAtOnPushFailure,
        pendingChangeCount: pendingCountOnPushFailure,
      }),
    });
    return { success: false, error: reason };
  } catch (error) {
    const previous = await getSyncStatus(poolId);
    const pendingCount = (await getPendingMatchCards(poolId)).length;
    const failureAt = new Date().toISOString();
    const reason = error instanceof Error ? error.message : String(error);
    await saveSyncStatus({
      poolId,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      lastFailureAt: failureAt,
      lastFailureReason: reason,
      pendingChangeCount: pendingCount,
      isStale: deriveIsStale({
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastFailureAt: failureAt,
        pendingChangeCount: pendingCount,
      }),
    });
    return { success: false, error: reason };
  }
}
