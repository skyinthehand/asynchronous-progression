import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** キャンセル以外の主操作ボタン等(任意)。フッターに並べて表示する。 */
  footer?: ReactNode;
  /** 個別の見た目調整(幅など)が必要な場合に追加するクラス名(任意)。 */
  className?: string;
}

/** タブレット操作を前提とした、画面内ボタンから開く汎用モーダル。 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <dialog
      open
      className={["app-modal", "no-print", className].filter(Boolean).join(" ")}
    >
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
