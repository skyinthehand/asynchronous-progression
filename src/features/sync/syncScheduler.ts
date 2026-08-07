import { SYNC_INTERVAL_MS } from "./syncStatusRules.js";

/**
 * FR-015: オンライン状態にある間、一定間隔でstartggへの同期を実行する。
 * オンライン復帰時にも即座に1回実行する。呼び出し元はクリーンアップ関数を
 * useEffect等で呼び出すこと。
 */
export function startSyncScheduler(runSync: () => Promise<void>): () => void {
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      void runSync();
    }
  }, SYNC_INTERVAL_MS);

  const handleOnline = () => {
    void runSync();
  };
  window.addEventListener("online", handleOnline);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener("online", handleOnline);
  };
}
