import { useEffect } from "react";
import { runSync } from "./syncRunner.js";
import { startSyncScheduler } from "./syncScheduler.js";

/** アプリ起動中、常時バックグラウンド同期を稼働させる。 */
export function useSyncScheduler(): void {
  useEffect(() => {
    return startSyncScheduler(runSync);
  }, []);
}
