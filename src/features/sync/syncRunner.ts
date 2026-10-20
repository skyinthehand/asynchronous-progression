import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import { recomputeIsLocked } from "../../domain/rules/editLock.js";
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
  deleteEntrants,
  getEntrantsByPool,
  saveEntrants,
} from "../../infra/storage/entrantRepository.js";
import {
  deleteMatchCards,
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
  if (local.localOnly && local.winnerId) {
    if (remote.status !== "COMPLETED") {
      // ユーザーフィードバック(2026-08-15): 結果(勝者)を保持しているカード
      // (M1未送信のもの)は、送信が成功するまでローカルを正とする。
      return local;
    }
    // ユーザーフィードバック(2026-10-20): 送信前にstart.gg側(TOの画面・
    // 選手の自己報告等)で既に結果が入力されていた場合は、start.ggを正と
    // してローカルの結果を破棄する(ローカルを正とし続けると、送信が
    // 完了済みセットへの報告として失敗し続け、永久に未反映のまま残る)。
    // 勝者が食い違っていた場合のみ、破棄した内容を残してモーダルで知らせる。
    const discarded: MatchCard =
      local.winnerId === remote.winnerId
        ? local
        : {
            ...local,
            discardedLocalResult: {
              winnerId: local.winnerId,
              score: local.score,
              discardedAt: new Date().toISOString(),
            },
          };
    return mergeMatchCard({ ...discarded, localOnly: false }, remote);
  }
  if (local.localOnly) {
    // advanceWinner(matchProgression.ts)による出場者反映のみ(winnerIdを
    // 持たない)のカード。startgg側が追いつけば保護を解除してよいが、
    // 「両方の枠が一致するまで一切remoteを取り込まない」という全体一致
    // 判定は誤り: 例えば片方の枠(J経由)だけローカルで先行反映していた間に、
    // startgg側は同じ対戦カードのもう片方の枠(round1のAの敗者)も既に
    // 解決していた場合、remoteの方がローカルより情報が新しい/多い状態に
    // なる。ここで全体一致を条件にすると、そのremote側の解決済みの値
    // ごと握りつぶし、まだローカルにない方の枠がいつまでもBYE表示の
    // ままになってしまう(実際に報告されたバグ: Rに「loser of A」が
    // 反映されない)。枠ごとに「remoteが既に値を持っていればremoteを
    // 信用し、remoteがまだnull(未解決)の枠だけローカルの先行反映を残す」
    // ようにする。
    const entrant1Id = remote.entrant1Id ?? local.entrant1Id;
    const entrant2Id = remote.entrant2Id ?? local.entrant2Id;
    const stillAheadOfRemote =
      entrant1Id !== remote.entrant1Id || entrant2Id !== remote.entrant2Id;
    if (stillAheadOfRemote) {
      return { ...local, entrant1Id, entrant2Id };
    }
    // remoteが全ての枠で追いついた: 以降の通常マージへ進み、localOnlyも解除する。
  }
  const statusStillPending =
    local.statusLocalOnly && remote.status === "NOT_STARTED";
  return {
    ...remote,
    editHistory: local.editHistory,
    isLocked: local.isLocked,
    // ユーザーフィードバック(2026-10-20): 対戦台番号は、送信待ち
    // (tableLocalOnly)の間だけローカルを優先する(送信中にstartgg側の
    // 古い値で巻き戻らないようにするため)。送信が完了した後は、以後の
    // 同期でstartgg側の最新値(他の経路での変更も含む)に追従できるよう
    // remoteを優先する。送信完了後もローカルを優先し続けると、表示が
    // 更新されなくなる不具合になっていた(002-match-scoring-and-flow
    // FR-016は「送信中は巻き戻らない」ことが目的で、「永久にローカルが
    // 正」という意味ではなかった)。
    tableNumber: local.tableLocalOnly ? local.tableNumber : remote.tableNumber,
    // entrant1Score/entrant2Score/DQ/Wは本feature独自のローカル入力専用
    // フィールドで、start.gg側に対応する概念がなくfetchPoolDetail()は常に
    // 既定値(null/false)を返す。localOnlyのクリア後にこのデフォルト値で
    // ローカルの記録を上書きしないよう、ローカル値を維持する。ただし
    // ユーザーフィードバック(2026-10-20): start.gg側で結果が修正・リセット
    // され勝者がローカルと変わった場合は、その記録は別の結果のものなので
    // 破棄する(残すと新しい勝者と食い違ったスコアが表示される)。
    ...(local.winnerId === remote.winnerId
      ? {
          entrant1Score: local.entrant1Score,
          entrant2Score: local.entrant2Score,
          entrant1DQ: local.entrant1DQ,
          entrant2DQ: local.entrant2DQ,
          entrant1W: local.entrant1W,
          entrant2W: local.entrant2W,
        }
      : {}),
    // ユーザーフィードバック(2026-08-13): 「進行中にする」操作で設定した
    // ステータスも、送信(M2/M3)が完了するまではstartgg側の古い値
    // (NOT_STARTED)で上書きされないよう、ローカル優先で判定する。
    // ユーザーフィードバック(2026-10-20): ただしstart.gg側が既に
    // NOT_STARTED以外(他の経路で開始済み・結果入力済み)なら、送信の目的
    // は達成済みなのでremoteを採用し送信待ちも解除する。以前は常にローカル
    // 優先だったため、markSetInProgressが「Set is already started」等で
    // 失敗し続けると、start.gg側で結果が入っても「進行中」のまま永久に
    // 「対戦終了」へ切り替わらない不具合になっていた(スマパでの報告)。
    status: statusStillPending ? local.status : remote.status,
    statusLocalOnly: statusStillPending,
    discardedLocalResult: local.discardedLocalResult,
    // ユーザーフィードバック(2026-10-19): 対戦台の送信待ちフラグも、
    // statusLocalOnlyと同様に常にローカル優先で維持する(remoteにこの
    // フィールドの概念は無く、ここで保護しないと送信が完了する前に
    // マージでfalseへ巻き戻ってしまう)。
    tableLocalOnly: local.tableLocalOnly,
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

    // ユーザーフィードバック(2026-10-20): 結果・状態はstart.gg側(TOの画面・
    // 選手の自己報告等)からも入力される。送信前にstart.gg側で既に結果が
    // 入っている/開始済みのセットへM1/M2を送ると、start.ggの結果をアプリの
    // 結果で上書きしたり、「Set is already started」等で失敗し続けたり
    // するため、送信するものがある場合のみ先にstart.gg側の状態を確認する
    // (送信をやめたカードのローカル側の扱いはmergeMatchCardが決める)。
    const needsRemoteCheck = pending.some(
      (card) =>
        !isPreviewSetId(card.id) &&
        ((card.localOnly && card.winnerId) || card.statusLocalOnly),
    );
    const remoteStatusById = new Map(
      needsRemoteCheck
        ? (await fetchPoolDetail(client, poolId)).matchCards.map((remote) => [
            remote.id,
            remote.status,
          ])
        : [],
    );

    for (const card of pending) {
      if (isPreviewSetId(card.id)) {
        // start.gg側でブラケットがまだ「開始」されておらず、実IDが
        // 割り当てられていない状態(FR: プレビューモード)。エラーには
        // せず、開始後の同期で改めて送信されるのを待つ。
        continue;
      }

      if (
        card.localOnly &&
        card.winnerId &&
        remoteStatusById.get(card.id) !== "COMPLETED"
      ) {
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

      // ユーザーフィードバック(2026-10-19): 状態(M2: markSetInProgress)と
      // 対戦台(M3: assignStation)の送信は、互いに独立して試行・成否判定
      // する(以前は1つのtry/catchにまとめていたため、既にstart.gg側でも
      // 進行中になっている対戦カードに対戦台だけを変更した場合でも、
      // 不要なmarkSetInProgressが「Set is already started」で失敗し、
      // そのエラーで対戦台の送信(assignStationToSet)まで一切実行され
      // なくなる不具合があった)。両方が保留中の場合に片方の保存で
      // もう片方のクリア結果を巻き戻さないよう、保存のたびに最新の
      // カードを保持し直す。
      let latestCard = card;
      const remoteStatus = remoteStatusById.get(latestCard.id);
      if (
        latestCard.statusLocalOnly &&
        (remoteStatus === undefined || remoteStatus === "NOT_STARTED")
      ) {
        try {
          if (latestCard.status === "IN_PROGRESS") {
            await markSetInProgress(client, latestCard.id);
          }
          latestCard = { ...latestCard, statusLocalOnly: false };
          await saveMatchCard(latestCard);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          pushErrors.push(`${latestCard.identifier}: ${reason}`);
        }
      }

      if (latestCard.tableLocalOnly) {
        // 対戦台番号がローカル独自の値でstart.gg側に対応するstationが
        // 存在しない場合は、そのカードのstation割り当てだけを諦める
        // (エラーにはしない)。
        try {
          if (latestCard.tableNumber !== null) {
            const stationId = await resolveStationId(latestCard.tableNumber);
            if (stationId) {
              await assignStationToSet(client, latestCard.id, stationId);
            }
          }
          latestCard = { ...latestCard, tableLocalOnly: false };
          await saveMatchCard(latestCard);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          pushErrors.push(`${latestCard.identifier}: ${reason}`);
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
    const mergedCards = recomputeIsLocked(
      reconcileAdvancement(mergedCardsBeforeReconcile),
    );
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
        // ユーザーフィードバック(2026-10-20): 次のセット自体が見つかって
        // いても(confirmed)、対戦相手はstart.gg側で後から確定する。相手が
        // 確定するまでは取得し直す(以前はconfirmedの時点で以後一切取得
        // し直さず、「不明」のまま更新されなかった)。対戦台は運用上
        // 割り当てないこともあり、待ち続けるとプール終了選手の人数分の
        // リクエストが毎回続いてしまうため、条件に含めない。
        if (
          entrant.nextMatch?.confirmed &&
          entrant.nextMatch.opponentName !== null
        ) {
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
      // ユーザーフィードバック(2026-10-20): start.gg側でプールから削除・
      // 移動された選手は、対戦カード(下記staleLocalIds)と同様にローカル
      // からも削除する(残すと選手一覧・出欠確認に表示され続ける)。
      const remoteEntrantIds = new Set(
        detail.entrants.map((entrant) => entrant.id),
      );
      await deleteEntrants(
        localEntrants
          .map((entrant) => entrant.id)
          .filter((id) => !remoteEntrantIds.has(id)),
      );
    }
    if (mergedCards.length > 0) {
      await saveMatchCards(mergedCards);
      // ユーザーフィードバック(2026-08-24): start.ggで「Start Bracket」を
      // 押すと、そのプールの全SetがpreviewId(`preview_...`)から実IDへ
      // 一斉に差し替わる。従来はsaveMatchCardsが新IDのカードをput
      // するだけで、古いpreviewIdのローカルレコードを消していなかった
      // ため、「Start Bracket」→「データを再取得」を行ってもpreviewId
      // のカードがローカルに残り続け、computeIsPreviewMode(全カードの
      // どれか1件でもpreviewId形式ならtrue)がいつまでもtrueのまま
      // (プレビューモードの警告バナー・編集ロックが消えない)という
      // バグになっていた。start.ggから返るmatchCardsはそのプールの
      // 現在の全Setなので、そこに含まれなくなったローカルカード(=
      // 差し替えで置き換えられた古いID)は孤児として削除してよい
      // (ローカル専用フィールドの引き継ぎは行わない設計、plan.md参照)。
      const remoteIds = new Set(detail.matchCards.map((card) => card.id));
      const staleLocalIds = localCards
        .map((card) => card.id)
        .filter((id) => !remoteIds.has(id));
      await deleteMatchCards(staleLocalIds);
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
