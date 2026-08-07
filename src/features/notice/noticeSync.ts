import type { Notice } from "../../domain/entities/notice.js";
import { hasEmergencyContact } from "../../domain/rules/noticeValidation.js";
import { createStartggClient } from "../../infra/startgg/client.js";
import { fetchTournamentRules } from "../../infra/startgg/operations.js";
import {
  getStartggConfig,
  saveNotice,
} from "../../infra/storage/adminRepository.js";

/**
 * FR-033: 対象トーナメントのstartgg側の共有情報(Rules)をread-onlyで取得し、
 * 注意書きとしてローカルに反映する。対象未設定・オフライン時は何もしない
 * (呼び出し元がエラーを投げずキャッシュ継続表示できるよう、例外は
 * ネットワークエラーのみ透過的に投げる)。
 */
export async function syncNotice(): Promise<Notice | undefined> {
  const config = await getStartggConfig();
  if (!config?.tournamentSlug || !config.syncToken) {
    return undefined;
  }
  const client = createStartggClient(config.syncToken);
  const body = await fetchTournamentRules(client, config.tournamentSlug);
  const notice: Notice = {
    tournamentSlug: config.tournamentSlug,
    body,
    hasEmergencyContact: hasEmergencyContact(body),
    lastSyncedAt: new Date().toISOString(),
  };
  return saveNotice(notice);
}
