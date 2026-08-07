import { useEffect, useState } from "react";
import type { ManagedPoolOption } from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";
import { TournamentDrillDown } from "./TournamentDrillDown.js";
import { ensurePoolFromOption } from "./poolBootstrap.js";

/**
 * FR-028: 対象プールのみを、Personal Access Tokenの入力をやり直すことなく
 * 再設定できる(既に保存済みのトークンを流用する)。
 */
export function PoolSelection() {
  const [savedToken, setSavedToken] = useState<string | null | undefined>(
    undefined,
  );
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    getStartggConfig().then((config) =>
      setSavedToken(config?.syncToken ?? null),
    );
  }, []);

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
      {savedMessage && <p>対象プールを更新しました。</p>}
      {savedToken === undefined ? null : savedToken === null ? (
        <p role="alert">
          保存済みのトークンがありません。先に初期化またはトークン設定を
          行ってください。
        </p>
      ) : (
        <TournamentDrillDown
          token={savedToken}
          onPoolSelected={(option) => {
            setSavedMessage(false);
            handleSelect(option);
          }}
        />
      )}
    </section>
  );
}
