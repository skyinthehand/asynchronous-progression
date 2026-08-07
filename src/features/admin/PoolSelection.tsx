import { useState } from "react";
import { createStartggClient } from "../../infra/startgg/client.js";
import {
  type ManagedPoolOption,
  listManagedPools,
} from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";
import { ensurePoolFromOption } from "./poolBootstrap.js";

/**
 * FR-028: 対象プールのみを、Personal Access Tokenの入力をやり直すことなく
 * 再設定できる(既に保存済みのトークンを流用して一覧を取得する)。
 */
export function PoolSelection() {
  const [options, setOptions] = useState<ManagedPoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const config = await getStartggConfig();
      if (!config?.syncToken) {
        setError(
          "保存済みのトークンがありません。先に初期化またはトークン設定を行ってください。",
        );
        return;
      }
      const client = createStartggClient(config.syncToken);
      const result = await listManagedPools(client);
      setOptions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(option: ManagedPoolOption) {
    const config = await getStartggConfig();
    if (!config) return;
    await saveStartggConfig({
      ...config,
      tournamentSlug: option.tournamentSlug,
      eventId: option.eventId,
      phaseId: option.phaseId,
      poolId: option.poolId,
    });
    await ensurePoolFromOption(option);
    setSavedMessage(true);
  }

  return (
    <section className="pool-selection">
      <h3>対象プールのみ変更</h3>
      <button type="button" disabled={loading} onClick={handleFetch}>
        {loading ? "取得中…" : "大会一覧を再取得"}
      </button>
      {error && <p role="alert">{error}</p>}
      {savedMessage && <p>対象プールを更新しました。</p>}
      {options.length > 0 && (
        <ul className="managed-pool-options">
          {options.map((option) => (
            <li key={option.poolId}>
              {option.tournamentName} / {option.eventName} / {option.phaseName}{" "}
              / {option.poolDisplayIdentifier}
              <button
                type="button"
                onClick={() => {
                  setSavedMessage(false);
                  handleSelect(option);
                }}
              >
                このプールを選択
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
