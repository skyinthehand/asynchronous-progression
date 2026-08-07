import { useState } from "react";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  type EventOption,
  type ManagedPoolOption,
  type TournamentOption,
  listMyTournaments,
  listPhasePools,
  listTournamentEvents,
} from "../../infra/startgg/operations.js";

interface TournamentDrillDownProps {
  token: string;
  onPoolSelected: (option: ManagedPoolOption) => void;
}

/**
 * start.gg APIの1リクエストあたりの複雑度上限(最大1000オブジェクト)を
 * 超えないよう、トーナメント→イベント/フェーズ→プールの順に段階的に
 * 絞り込んで取得するUI(research.md 5.のQ1設計を参照)。
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
  const [pools, setPools] = useState<
    | { poolId: string; poolDisplayIdentifier: string; bracketType: string }[]
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="tournament-drill-down">
      {tournaments === null && (
        <button type="button" disabled={loading} onClick={loadTournaments}>
          {loading ? "取得中…" : "大会一覧を取得"}
        </button>
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
          {pools.map((pool) => (
            <li key={pool.poolId}>
              {pool.poolDisplayIdentifier}
              <button
                type="button"
                onClick={() =>
                  onPoolSelected({
                    tournamentSlug: tournament.tournamentSlug,
                    tournamentName: tournament.tournamentName,
                    eventId: event.eventId,
                    eventName: event.eventName,
                    phaseId: phase.phaseId,
                    phaseName: phase.phaseName,
                    poolId: pool.poolId,
                    poolDisplayIdentifier: pool.poolDisplayIdentifier,
                    bracketType:
                      pool.bracketType as ManagedPoolOption["bracketType"],
                  })
                }
              >
                このプールを選択
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
