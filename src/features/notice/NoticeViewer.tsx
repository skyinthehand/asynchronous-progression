import { useState } from "react";
import { NoticeMarkdown } from "../../components/index.js";
import { useNotice } from "./useNotice.js";

/** FR-002: 注意書きをいつでも再確認できる専用の操作(ボタン)。 */
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
          <path d="M12 3 2 21h20L12 3z" />
          <path d="M12 10v5" />
          <path d="M12 18v.5" />
        </svg>
        注意書き
      </button>
      {open && (
        <dialog open className="notice-viewer" aria-modal="true">
          <NoticeMarkdown
            text={notice?.body ?? "注意事項を取得できませんでした。"}
          />
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </dialog>
      )}
    </>
  );
}
