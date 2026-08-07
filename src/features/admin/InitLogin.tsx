import { useState } from "react";
import type { ManagedPoolOption } from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";
import { TournamentDrillDown } from "./TournamentDrillDown.js";
import { ensurePoolFromOption } from "./poolBootstrap.js";

interface InitLoginProps {
  onInitialized: () => void;
}

/**
 * FR-027: 初期化フローの一括実行。(1) PATを入力して管理権限のある
 * トーナメント/イベント/フェーズ/プールを段階的に絞り込み、(2) 対象プールを
 * 選択し、(3) 選択と同時に定期同期用トークンとして保存する。
 */
export function InitLogin({ onInitialized }: InitLoginProps) {
  const [token, setToken] = useState("");
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);

  async function handleSelect(option: ManagedPoolOption) {
    const existing = await getStartggConfig();
    await saveStartggConfig({
      tournamentSlug: option.tournamentSlug,
      eventId: option.eventId,
      phaseId: option.phaseId,
      poolId: option.poolId,
      syncToken: confirmedToken ?? token.trim(),
      tokenUpdatedAt: new Date().toISOString(),
      adminPasswordHash: existing?.adminPasswordHash ?? null,
    });
    await ensurePoolFromOption(option);
    onInitialized();
  }

  return (
    <section className="init-login">
      <h3>初期化(ログイン〜対象プール指定〜トークン設定)</h3>
      {confirmedToken === null ? (
        <>
          <label>
            startgg Personal Access Token:
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Personal Access Token"
            />
          </label>
          <button
            type="button"
            disabled={!token.trim()}
            onClick={() => setConfirmedToken(token.trim())}
          >
            次へ
          </button>
        </>
      ) : (
        <TournamentDrillDown
          token={confirmedToken}
          onPoolSelected={handleSelect}
        />
      )}
    </section>
  );
}
