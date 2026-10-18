import { useEffect, useState } from "react";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  type EventOption,
  type ManagedPoolOption,
  type PoolOption,
  type TournamentOption,
  listMyTournaments,
  listPhasePools,
  listTournamentEvents,
} from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  getTournamentHistory,
  recordTournamentHistory,
} from "../../infra/storage/adminRepository.js";

interface TournamentDrillDownProps {
  token: string;
  onPoolSelected: (option: ManagedPoolOption) => void;
}

/** 直近に選択した大会・イベント・フェーズ(PoolSelection.handleSelect/InitLogin.handleSelectが保存)。 */
interface RecentSelection {
  tournamentSlug: string;
  tournamentName: string;
  eventId: string;
  eventName: string;
  phaseId: string;
  phaseName: string;
}

/**
 * start.gg APIの1リクエストあたりの複雑度上限(最大1000オブジェクト)を
 * 超えないよう、トーナメント→イベント/フェーズ→プールの順に段階的に
 * 絞り込んで取得するUI(research.md 5.のQ1設計を参照)。
 *
 * ユーザーフィードバック(2026-10-18): 同じ端末で同じ大会・イベントの
 * 複数プールを扱うことが多いため、(1) 直近に選択した大会・イベントを
 * デフォルトとし、対象プールの選択だけで済ませる(「大会・イベントを
 * 変更」を押したときだけ最初からやり直す)。(2) 大会一覧に出ない大会を
 * スラッグ直接入力する際、過去に使ったスラッグを履歴からすぐ選べる
 * ようにする。
 */
export function TournamentDrillDown({
  token,
  onPoolSelected,
}: TournamentDrillDownProps) {
  const [tournaments, setTournaments] = useState<TournamentOption[] | null>(
    null,
  );
  const [tournament, setTournament] = useState<TournamentOption | null>(null);
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [event, setEvent] = useState<EventOption | null>(null);
  const [phase, setPhase] = useState<{
    phaseId: string;
    phaseName: string;
  } | null>(null);
  const [pools, setPools] = useState<PoolOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualSlug, setManualSlug] = useState("");
  const [slugHistory, setSlugHistory] = useState<
    { tournamentSlug: string; tournamentName: string }[]
  >([]);
  const [recent, setRecent] = useState<RecentSelection | null | undefined>(
    undefined,
  );
  const [recentPools, setRecentPools] = useState<PoolOption[] | null>(null);
  const [changingRecent, setChangingRecent] = useState(false);

  useEffect(() => {
    (async () => {
      const [config, history] = await Promise.all([
        getStartggConfig(),
        getTournamentHistory(),
      ]);
      setSlugHistory(history);
      if (
        config?.tournamentSlug &&
        config.tournamentName &&
        config.eventId &&
        config.eventName &&
        config.phaseId &&
        config.phaseName
      ) {
        setRecent({
          tournamentSlug: config.tournamentSlug,
          tournamentName: config.tournamentName,
          eventId: config.eventId,
          eventName: config.eventName,
          phaseId: config.phaseId,
          phaseName: config.phaseName,
        });
      } else {
        setRecent(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!recent || changingRecent) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = createStartggClient(token);
    listPhasePools(client, recent.phaseId)
      .then((result) => {
        if (!cancelled) setRecentPools(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recent, changingRecent, token]);

  async function withLoading<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  async function loadTournaments() {
    const client = createStartggClient(token);
    const result = await withLoading(() => listMyTournaments(client));
    if (result) setTournaments(result);
  }

  async function selectTournament(option: TournamentOption) {
    setTournament(option);
    setEvent(null);
    setPhase(null);
    setPools(null);
    await recordTournamentHistory(option.tournamentSlug, option.tournamentName);
    setSlugHistory(await getTournamentHistory());
    const client = createStartggClient(token);
    const result = await withLoading(() =>
      listTournamentEvents(client, option.tournamentSlug),
    );
    if (result) setEvents(result);
  }

  async function selectPhase(
    selectedEvent: EventOption,
    selectedPhase: { phaseId: string; phaseName: string },
  ) {
    setEvent(selectedEvent);
    setPhase(selectedPhase);
    setPools(null);
    const client = createStartggClient(token);
    const result = await withLoading(() =>
      listPhasePools(client, selectedPhase.phaseId),
    );
    if (result) setPools(result);
  }

  /**
   * ユーザーフィードバック(2026-10-18): 「直近の選択」「通常の絞り込み」
   * いずれの最終段でも同じプール選択行を使う(総当り非対応の扱いを
   * 1箇所に集約する)。
   */
  function renderPoolOption(
    pool: PoolOption,
    target: {
      tournamentSlug: string;
      tournamentName: string;
      eventId: string;
      eventName: string;
      phaseId: string;
      phaseName: string;
    },
  ) {
    // ユーザーフィードバック(2026-08-17): 総当り(ROUND_ROBIN)形式の
    // 動作確認がまだ不十分なため、後日対応予定として当面は選択でき
    // ないようにする(選択画面の時点で防ぐ)。
    const unsupported = pool.bracketType === "ROUND_ROBIN";
    return (
      <li key={pool.poolId}>
        {pool.poolDisplayIdentifier}
        {unsupported && (
          <span className="drill-down-unsupported-note">
            (総当り形式は現在非対応です)
          </span>
        )}
        <button
          type="button"
          disabled={unsupported}
          onClick={() =>
            onPoolSelected({
              ...target,
              poolId: pool.poolId,
              poolDisplayIdentifier: pool.poolDisplayIdentifier,
              bracketType: pool.bracketType as ManagedPoolOption["bracketType"],
            })
          }
        >
          このプールを選択
        </button>
      </li>
    );
  }

  // 直近の選択(IndexedDB)を読み込み中は、通常の絞り込みUIを一瞬だけ
  // 表示してしまわないよう何も描画しない。
  if (recent === undefined) {
    return null;
  }

  // ユーザーフィードバック(2026-10-18): 直近に大会・イベント・フェーズを
  // 選択済み、かつ「大会・イベントを変更」が押されていない間は、対象
  // プールの選び直しだけで済むようにする。
  if (recent && !changingRecent) {
    return (
      <div className="tournament-drill-down">
        <p className="tournament-drill-down-recent">
          <strong>{recent.tournamentName}</strong> / {recent.eventName} /{" "}
          {recent.phaseName}
        </p>
        <button
          type="button"
          onClick={() => {
            setChangingRecent(true);
            setRecentPools(null);
          }}
        >
          大会・イベントを変更
        </button>
        {error && <p role="alert">取得に失敗しました: {error}</p>}
        {loading && <p>プール一覧を取得中…</p>}
        {recentPools && (
          <ul className="drill-down-options">
            {recentPools.map((pool) => renderPoolOption(pool, recent))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="tournament-drill-down">
      {!tournament && (
        <div className="tournament-drill-down-lookup">
          <button type="button" disabled={loading} onClick={loadTournaments}>
            {loading ? "取得中…" : "大会一覧を取得"}
          </button>
          <p>
            一覧に目的の大会が出ない場合(非公開の大会など)は、大会URLの
            スラッグを直接入力してください。
          </p>
          {slugHistory.length > 0 && (
            <div className="tournament-drill-down-history">
              <p>過去に入力した大会スラッグ:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {slugHistory.map((entry) => (
                  <button
                    key={entry.tournamentSlug}
                    type="button"
                    disabled={loading}
                    onClick={() => selectTournament(entry)}
                  >
                    {entry.tournamentName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label>
            大会スラッグ(例: start.gg/tournament/
            <strong>impact-major-4</strong>/... の太字部分):
            <input
              value={manualSlug}
              onChange={(event) => setManualSlug(event.target.value)}
              placeholder="tournament-slug"
            />
          </label>
          <button
            type="button"
            disabled={loading || !manualSlug.trim()}
            onClick={() =>
              selectTournament({
                tournamentSlug: manualSlug.trim(),
                tournamentName: manualSlug.trim(),
              })
            }
          >
            このスラッグで進める
          </button>
        </div>
      )}
      {error && <p role="alert">取得に失敗しました: {error}</p>}

      {tournaments && !tournament && (
        <ul className="drill-down-options">
          {tournaments.map((option) => (
            <li key={option.tournamentSlug}>
              {option.tournamentName}
              <button
                type="button"
                disabled={loading}
                onClick={() => selectTournament(option)}
              >
                選択
              </button>
            </li>
          ))}
        </ul>
      )}

      {tournament && !phase && events && (
        <ul className="drill-down-options">
          {events.flatMap((eventOption) =>
            eventOption.phases.map((phaseOption) => (
              <li key={`${eventOption.eventId}-${phaseOption.phaseId}`}>
                {eventOption.eventName} / {phaseOption.phaseName}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => selectPhase(eventOption, phaseOption)}
                >
                  選択
                </button>
              </li>
            )),
          )}
        </ul>
      )}

      {tournament && event && phase && pools && (
        <ul className="drill-down-options">
          {pools.map((pool) =>
            renderPoolOption(pool, {
              tournamentSlug: tournament.tournamentSlug,
              tournamentName: tournament.tournamentName,
              eventId: event.eventId,
              eventName: event.eventName,
              phaseId: phase.phaseId,
              phaseName: phase.phaseName,
            }),
          )}
        </ul>
      )}
    </div>
  );
}
