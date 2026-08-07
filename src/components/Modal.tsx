import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** キャンセル以外の主操作ボタン等(任意)。フッターに並べて表示する。 */
  footer?: ReactNode;
}

/** タブレット操作を前提とした、画面内ボタンから開く汎用モーダル。 */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  return (
    <dialog open className="app-modal no-print">
      <div className="app-modal-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="app-modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          閉じる
        </button>
      </div>
      <div className="app-modal-body">{children}</div>
      {footer && <div className="app-modal-footer">{footer}</div>}
    </dialog>
  );
}
