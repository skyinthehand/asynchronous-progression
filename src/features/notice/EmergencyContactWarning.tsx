import { useNotice } from "./useNotice.js";

/**
 * FR-003: startgg側から取得した注意書きに緊急連絡先の記載が確認できない
 * 場合、警告を表示する(保存操作自体を止めることはできないため、警告のみ)。
 */
export function EmergencyContactWarning() {
  const { notice } = useNotice();

  if (!notice || notice.hasEmergencyContact) {
    return null;
  }

  return (
    <div className="emergency-contact-warning no-print" role="alert">
      注意書きに緊急時の連絡方法の記載が確認できません。startgg側の対象
      イベントのRules設定を管理者に確認・追記してもらってください。
    </div>
  );
}
