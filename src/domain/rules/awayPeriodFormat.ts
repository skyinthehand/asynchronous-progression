const JST_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * ユーザーフィードバック(2026-08-14): 離席記録モーダルで、離席した選手の
 * 横に離席開始時刻を表示する。端末のローカルタイムゾーン設定に関わらず
 * 常に日本時間で表示するため、Intl.DateTimeFormatにtimeZone指定で明示する
 * (会場端末のタイムゾーン設定が誤っていても表示がずれないようにするため)。
 */
export function formatAwayStartedAt(startedAt: string): string {
  return JST_TIME_FORMATTER.format(new Date(startedAt));
}
