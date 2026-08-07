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

interface InitLoginProps {
  onInitialized: () => void;
}

/**
 * FR-027: 初期化フローの一括実行。(1) PATを入力して管理権限のある
 * トーナメント/イベント/フェーズ/プール一覧を取得し、(2) 対象プールを
 * 選択し、(3) 選択と同時に定期同期用トークンとして保存する。
 */
export function InitLogin({ onInitialized }: InitLoginProps) {
  const [token, setToken] = useState("");
  const [options, setOptions] = useState<ManagedPoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const client = createStartggClient(token.trim());
      const result = await listManagedPools(client);
      setOptions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(option: ManagedPoolOption) {
    const existing = await getStartggConfig();
    await saveStartggConfig({
      tournamentSlug: option.tournamentSlug,
      eventId: option.eventId,
      phaseId: option.phaseId,
      poolId: option.poolId,
      syncToken: token.trim(),
      tokenUpdatedAt: new Date().toISOString(),
      adminPasswordHash: existing?.adminPasswordHash ?? null,
    });
    await ensurePoolFromOption(option);
    onInitialized();
  }

  return (
    <section className="init-login">
      <h3>初期化(ログイン〜対象プール指定〜トークン設定)</h3>
      <label>
        startgg Personal Access Token:
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Personal Access Token"
        />
      </label>
      <button type="button" disabled={loading} onClick={handleFetch}>
        {loading ? "取得中…" : "大会一覧を取得"}
      </button>
      {error && <p role="alert">取得に失敗しました: {error}</p>}
      {options.length > 0 && (
        <ul className="managed-pool-options">
          {options.map((option) => (
            <li key={option.poolId}>
              {option.tournamentName} / {option.eventName} / {option.phaseName}{" "}
              / {option.poolDisplayIdentifier}
              <button type="button" onClick={() => handleSelect(option)}>
                このプールを選択
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
