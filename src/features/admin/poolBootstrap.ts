import type { ManagedPoolOption } from "../../infra/startgg/operations.js";
import { getPool, savePool } from "../../infra/storage/poolRepository.js";

/**
 * FR-010/FR-027: 選択されたプールの `Pool` レコードを作成/更新する。
 * 対戦カード等の同期(Q2)はこのレコードの存在を前提とするため、対象プール
 * が(初回選択・再選択のいずれでも)決まった時点で必ず用意しておく。
 */
export async function ensurePoolFromOption(
  option: ManagedPoolOption,
): Promise<void> {
  const existing = await getPool(option.poolId);
  await savePool({
    id: option.poolId,
    displayIdentifier: option.poolDisplayIdentifier,
    tournamentSlug: option.tournamentSlug,
    eventId: option.eventId,
    phaseId: option.phaseId,
    className: existing?.className ?? null,
    bracketType: option.bracketType,
    staffName: existing?.staffName ?? null,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    tournamentName: option.tournamentName,
    eventName: option.eventName,
    phaseName: option.phaseName,
    onboardingCompletedAt: existing?.onboardingCompletedAt ?? null,
    tableNumbers: existing?.tableNumbers ?? [],
  });
}
