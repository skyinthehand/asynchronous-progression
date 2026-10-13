import { NoticeMarkdown } from "../../components/index.js";
import { useNotice } from "../notice/useNotice.js";

/**
 * FR-032: 現在の進行ルール(start.gg側対象イベントのRules)を表示し、
 * startgg側の編集画面へのリンクを提供する(本文の編集自体はstartgg側で
 * 行う。本ツール内では編集しない)。
 */
export function NoticeAdminPanel() {
  const { notice } = useNotice();

  return (
    <section className="notice-admin-panel">
      <h3>進行ルール</h3>
      {notice ? (
        <>
          <p className="label notice-scope">
            対象大会: {notice.tournamentSlug}
          </p>
          <NoticeMarkdown text={notice.body} />
        </>
      ) : (
        <p>進行ルールをまだ取得できていません。</p>
      )}
      {notice && (
        <a
          href={`https://www.start.gg/tournament/${notice.tournamentSlug}/admin`}
          target="_blank"
          rel="noreferrer"
        >
          startgg側で対象イベントのRules設定を編集する
        </a>
      )}
    </section>
  );
}
