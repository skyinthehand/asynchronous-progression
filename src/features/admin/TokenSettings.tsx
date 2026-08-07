import { useState } from "react";
import {
  getStartggConfig,
  saveStartggConfig,
} from "../../infra/storage/adminRepository.js";

/**
 * FR-028: 定期同期用トークンのみを、対象プールの再指定を行うことなく
 * 単独で再設定できる。
 */
export function TokenSettings() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!token.trim()) return;
    const config = await getStartggConfig();
    await saveStartggConfig({
      tournamentSlug: config?.tournamentSlug ?? null,
      eventId: config?.eventId ?? null,
      phaseId: config?.phaseId ?? null,
      poolId: config?.poolId ?? null,
      syncToken: token.trim(),
      tokenUpdatedAt: new Date().toISOString(),
      adminPasswordHash: config?.adminPasswordHash ?? null,
    });
    setToken("");
    setSaved(true);
  }

  return (
    <section className="token-settings">
      <h3>トークンのみ変更</h3>
      <label>
        新しいstartgg Personal Access Token:
        <input
          type="password"
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button type="button" disabled={!token.trim()} onClick={handleSave}>
        保存
      </button>
      {saved && <p>トークンを更新しました。</p>}
    </section>
  );
}
