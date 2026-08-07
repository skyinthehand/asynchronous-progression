import { useEffect, useState } from "react";
import type { SyncStatus } from "../../domain/entities/syncStatus.js";
import {
  getStartggConfig,
  getSyncStatus,
} from "../../infra/storage/adminRepository.js";

const POLL_INTERVAL_MS = 5_000;

/** 同期状況を定期的にローカルストレージから読み直す表示用フック。 */
export function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const config = await getStartggConfig();
      if (!config?.poolId) return;
      const latest = await getSyncStatus(config.poolId);
      if (!cancelled) {
        setStatus(latest ?? null);
      }
    }

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return status;
}
