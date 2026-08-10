import { useEffect, useState } from "react";
import type { Pool } from "../../domain/entities/pool.js";
import { getStartggConfig } from "../../infra/storage/adminRepository.js";
import { getPool, savePool } from "../../infra/storage/poolRepository.js";
import { TableCountSettingPanel } from "../pool-progress/TableCountSettingPanel.js";

/**
 * FR-011/FR-015: 対象プール(FR-010: 1端末=1プール)の対戦台設定を管理画面
 * から行う。usePoolProgress(一般モード画面専用)を経由せず、
 * poolRepositoryを直接読み書きする(管理画面は複数プールを横断的に扱う
 * ため、特定プールの進行状態フックには依存しない)。
 */
export function TableSettingsPanel() {
  const [pool, setPool] = useState<Pool | null | undefined>(undefined);

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
      ) : (
        <TableCountSettingPanel
          tableNumbers={pool.tableNumbers}
          onSetTableNumbers={handleSetTableNumbers}
        />
      )}
    </section>
  );
}
