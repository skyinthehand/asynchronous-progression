import { type ReactNode, useState } from "react";
import { NoticeMarkdown } from "../../components/index.js";
import { useNotice } from "./useNotice.js";

interface NoticeGateProps {
  children: ReactNode;
}

/**
 * FR-001: 進行担当者がツールを開いた際に、他の操作より前に進行ルール
 * (start.gg側の対象イベントのRulesを同期したもの)を表示する。確認操作を
 * するまで子要素(=それ以外の全画面)を描画しない。
 */
export function NoticeGate({ children }: NoticeGateProps) {
  const { notice, loading } = useNotice();
  const [acknowledged, setAcknowledged] = useState(false);

  if (acknowledged) {
    return <>{children}</>;
  }

  return (
    <dialog open className="notice-gate" aria-modal="true">
      {notice && (
        <p className="label notice-scope">対象大会: {notice.tournamentSlug}</p>
      )}
      <h2>進行ルール</h2>
      {notice ? (
        <NoticeMarkdown text={notice.body} />
      ) : loading ? (
        <p className="notice-status">
          進行ルールを同期しています。しばらくお待ちください…
        </p>
      ) : (
        <p className="notice-status">
          進行ルールをまだ取得できていません。管理画面で大会の初期化が
          完了しているか、ネットワーク接続をご確認ください。
        </p>
      )}
      <button type="button" onClick={() => setAcknowledged(true)}>
        内容を確認しました
      </button>
    </dialog>
  );
}
