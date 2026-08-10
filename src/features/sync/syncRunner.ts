import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { reconcileAdvancement } from "../../domain/rules/matchProgression.js";
import { computePoolFinished } from "../../domain/rules/poolFinished.js";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  fetchNextMatch,
  fetchPoolDetail,
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
    // ローカルで未反映の結果がある場合は、ローカルを正としてstartgg側の
    // 古い値で上書きしない(次回同期で改めてM1を送信する)。
    return local;
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
    // entrant1Score/entrant2Score/DQ/skippedFromSuggestionは本feature独自の
    // ローカル入力専用フィールドで、start.gg側に対応する概念がなく
    // fetchPoolDetail()は常に既定値(null/false)を返す。localOnlyのクリア後に
    // このデフォルト値でローカルの記録を上書きしないよう、常にローカル値を
    // そのまま維持する。
    entrant1Score: local.entrant1Score,
    entrant2Score: local.entrant2Score,
    entrant1DQ: local.entrant1DQ,
    entrant2DQ: local.entrant2DQ,
    skippedFromSuggestion: local.skippedFromSuggestion,
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

  try {
    const client = createStartggClient(config.syncToken);

    const pending = await getPendingMatchCards(poolId);
    for (const card of pending) {
      if (!card.winnerId) continue;
      const outcome = await reportMatchResult(client, {
        setId: card.id,
        winnerId: card.winnerId,
      });
      await saveMatchCard({
        ...card,
        winnerId: outcome.winnerId ?? card.winnerId,
        score: outcome.score ?? card.score,
        status: outcome.status,
        localOnly: false,
      });
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

    await saveSyncStatus({
      poolId,
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: (await getSyncStatus(poolId))?.lastFailureAt ?? null,
      lastFailureReason: null,
      pendingChangeCount: 0,
      isStale: false,
    });
    return { success: true };
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
