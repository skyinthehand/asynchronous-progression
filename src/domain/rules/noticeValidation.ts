/**
 * FR-003: 注意書きの内容に緊急時の連絡方法が含まれていることを検出する。
 *
 * startgg側で自由記述されるテキストの意味内容までは判定できないため、
 * 電話番号・メールアドレス・代表的な連絡手段のキーワードのいずれかを
 * 含むかどうかによるヒューリスティック判定とする(偽陰性より偽陽性を
 * 許容し、過剰な警告よりは見逃しを避ける方向には倒さない = 疑わしい場合は
 * 警告を出す)。
 */
const PHONE_PATTERN = /(0\d{1,4}-\d{1,4}-\d{3,4}|\+?\d[\d\- ]{8,}\d)/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const CONTACT_KEYWORD_PATTERN =
  /(緊急連絡|緊急時|連絡先|お問い合わせ|Discord|discord|LINE|line|Twitter|X\(旧Twitter\))/;

export function hasEmergencyContact(noticeBody: string): boolean {
  if (!noticeBody.trim()) {
    return false;
  }
  return (
    PHONE_PATTERN.test(noticeBody) ||
    EMAIL_PATTERN.test(noticeBody) ||
    CONTACT_KEYWORD_PATTERN.test(noticeBody)
  );
}
