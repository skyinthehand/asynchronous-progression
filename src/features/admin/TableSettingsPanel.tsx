import { useCallback, useEffect, useState } from "react";
import type { Pool } from "../../domain/entities/pool.js";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  type StationOption,
  fetchStations,
} from "../../infra/startgg/operations.js";
import { getStartggConfig } from "../../infra/storage/adminRepository.js";
import { getPool, savePool } from "../../infra/storage/poolRepository.js";
import { TableCountSettingPanel } from "../pool-progress/TableCountSettingPanel.js";

type StationState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "error"; message: string }
  | { status: "loaded"; stations: StationOption[] };

/**
 * FR-011/FR-015: 対象プール(FR-010: 1端末=1プール)の対戦台設定を管理画面
 * から行う。usePoolProgress(一般モード画面専用)を経由せず、
 * poolRepositoryを直接読み書きする(管理画面は複数プールを横断的に扱う
 * ため、特定プールの進行状態フックには依存しない)。
 *
 * ユーザーフィードバック(2026-08-13): 対戦台番号は手入力ではなく、
 * startgg側に登録済みのstation一覧(トーナメント単位)から、このプールで
 * 使うものを選択する形にする。
 */
export function TableSettingsPanel() {
  const [pool, setPool] = useState<Pool | null | undefined>(undefined);
  const [stationState, setStationState] = useState<StationState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await getStartggConfig();
      if (!config?.poolId) {
        if (!cancelled) setPool(null);
        return;
      }
      const loaded = await getPool(config.poolId);
      if (!cancelled) setPool(loaded ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStations = useCallback(async () => {
    setStationState({ status: "loading" });
    const config = await getStartggConfig();
    if (!config?.syncToken || !config.tournamentSlug) {
      setStationState({ status: "no-token" });
      return;
    }
    try {
      const client = createStartggClient(config.syncToken);
      const stations = await fetchStations(client, config.tournamentSlug);
      setStationState({ status: "loaded", stations });
    } catch (error) {
      setStationState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  async function handleSetTableNumbers(tableNumbers: string[]) {
    if (!pool) return;
    const updated: Pool = { ...pool, tableNumbers };
    await savePool(updated);
    setPool(updated);
  }

  return (
    <section className="table-settings-panel">
      <h3>対戦台</h3>
      {pool === undefined ? null : pool === null ? (
        <p role="alert">
          対象プールが未設定です。先にプールを選択してください。
        </p>
      ) : stationState.status === "no-token" ? (
        <p role="alert">
          保存済みのトークンがありません。先に初期化またはトークン設定を
          行ってください。
        </p>
      ) : stationState.status === "loading" ? (
        <p>startggの対戦台(station)一覧を取得しています…</p>
      ) : stationState.status === "error" ? (
        <div>
          <p role="alert">
            対戦台一覧の取得に失敗しました: {stationState.message}
          </p>
          <button type="button" onClick={loadStations}>
            再試行
          </button>
        </div>
      ) : (
        <TableCountSettingPanel
          tableNumbers={pool.tableNumbers}
          availableStations={stationState.stations}
          onSetTableNumbers={handleSetTableNumbers}
          onRefetchStations={loadStations}
        />
      )}
    </section>
  );
}
