import { useState } from "react";
import { NoticeMarkdown } from "../../components/index.js";
import { useNotice } from "./useNotice.js";

/**
 * FR-002: 進行ルール(start.gg側の対象イベントのRulesを同期したもの)を
 * いつでも再確認できる専用の操作(ボタン)。
 */
export function NoticeViewer() {
  const { notice } = useNotice();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M8 3h8a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
        進行ルール
      </button>
      {open && (
        <dialog open className="notice-viewer" aria-modal="true">
          {notice && (
            <p className="label notice-scope">
              対象大会: {notice.tournamentSlug}
            </p>
          )}
          <NoticeMarkdown
            text={notice?.body ?? "進行ルールを取得できませんでした。"}
          />
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </dialog>
      )}
    </>
  );
}
