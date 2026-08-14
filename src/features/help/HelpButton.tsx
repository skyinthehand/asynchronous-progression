import { useState } from "react";
import usageGuide from "../../../docs/usage.md?raw";
import { HelpMarkdown, Modal } from "../../components/index.js";

/**
 * ユーザー要望(2026-08-18): 最初の画面(注意事項ダイアログ)を含め、常に
 * 使い方(docs/usage.md)を確認できる「？」ボタンを配置する。NoticeGateは
 * 未確認の間は他の子要素を描画しないため、この要望を満たすには
 * NoticeGateの外側(App.tsx)に配置する必要がある。docs/usage.mdの内容は
 * `?raw`インポートでバンドルするため、この案内文自体もドキュメントと
 * 常に同じ内容になる(二重管理にならない)。
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="help-button no-print"
        onClick={() => setOpen(true)}
        aria-label="使い方を表示"
        title="使い方"
      >
        ?
      </button>
      {open && (
        <Modal
          title="使い方"
          onClose={() => setOpen(false)}
          className="help-modal"
        >
          <HelpMarkdown text={usageGuide} />
        </Modal>
      )}
    </>
  );
}
