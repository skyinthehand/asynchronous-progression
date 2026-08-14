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
        注意書きを確認
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
