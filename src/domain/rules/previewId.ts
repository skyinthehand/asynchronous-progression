const PREVIEW_ID_PATTERN = /^(.*)_(-?\d+)_(\d+)$/;

/**
 * start.gg側で未開始(preview)のブラケットは、Set.idとして
 * `preview_{phaseGroupId}_{round}_{index}`という合成IDを返す。このIDを
 * そのまま結果報告(reportBracketSet)のsetIdに使うと
 * 「Must start bracket before performing action」で拒否される
 * (ユーザーフィードバック2026-08-12/13で確認)。
 */
export function isPreviewSetId(id: string): boolean {
  const parsed = PREVIEW_ID_PATTERN.exec(id);
  return parsed?.[1].startsWith("preview_") ?? false;
}
