import { useEffect, useState } from "react";
import type { Notice } from "../../domain/entities/notice.js";
import {
  getNotice,
  getStartggConfig,
} from "../../infra/storage/adminRepository.js";
import { syncNotice } from "./noticeSync.js";

interface UseNoticeResult {
  notice: Notice | null;
  /** trueの間は、まだキャッシュも同期結果も得られていない可能性がある。 */
  loading: boolean;
}

/** 注意書きの取得(キャッシュ読み込み→バックグラウンド同期試行)を担う共有フック。 */
export function useNotice(): UseNoticeResult {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const config = await getStartggConfig();
      if (config?.tournamentSlug) {
        const cached = await getNotice(config.tournamentSlug);
        if (!cancelled && cached) {
          setNotice(cached);
        }
      }
      try {
        const fresh = await syncNotice();
        if (!cancelled && fresh) {
          setNotice(fresh);
        }
      } catch {
        // オフライン・未設定時はキャッシュの表示を継続する(FR-012相当の
        // 精神をNoticeにも適用: 通信不可がユーザー操作を止めない)。
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { notice, loading };
}
