import {
  type AdminSession,
  AdminSessionSchema,
} from "../../domain/schemas/adminSession.js";
import { type Notice, NoticeSchema } from "../../domain/schemas/notice.js";
import {
  type StaffAssignmentEntry,
  StaffAssignmentEntrySchema,
} from "../../domain/schemas/staffAssignment.js";
import {
  type StartggIntegrationConfig,
  StartggIntegrationConfigSchema,
} from "../../domain/schemas/startggConfig.js";
import {
  type SyncStatus,
  SyncStatusSchema,
} from "../../domain/schemas/syncStatus.js";
import {
  type TournamentHistoryEntry,
  TournamentHistoryEntrySchema,
} from "../../domain/schemas/tournamentHistory.js";
import { SINGLETON_KEY, getDb } from "./db.js";

// --- StaffAssignmentEntry ---

export async function addStaffAssignment(
  entry: StaffAssignmentEntry,
): Promise<StaffAssignmentEntry> {
  const validated = StaffAssignmentEntrySchema.parse(entry);
  const db = await getDb();
  const id = await db.add("staffAssignments", validated);
  return { ...validated, id: id as number };
}

export async function getStaffAssignmentsByPool(
  poolId: string,
): Promise<StaffAssignmentEntry[]> {
  const db = await getDb();
  const values = await db.getAllFromIndex("staffAssignments", "poolId", poolId);
  return values.map((value) => StaffAssignmentEntrySchema.parse(value));
}

// --- Notice ---

export async function saveNotice(notice: Notice): Promise<Notice> {
  const validated = NoticeSchema.parse(notice);
  const db = await getDb();
  await db.put("notice", validated);
  return validated;
}

export async function getNotice(
  tournamentSlug: string,
): Promise<Notice | undefined> {
  const db = await getDb();
  const value = await db.get("notice", tournamentSlug);
  return value ? NoticeSchema.parse(value) : undefined;
}

// --- AdminSession (singleton) ---

export async function saveAdminSession(
  session: AdminSession,
): Promise<AdminSession> {
  const validated = AdminSessionSchema.parse(session);
  const db = await getDb();
  await db.put("adminSession", validated, SINGLETON_KEY);
  return validated;
}

export async function getAdminSession(): Promise<AdminSession | undefined> {
  const db = await getDb();
  const value = await db.get("adminSession", SINGLETON_KEY);
  return value ? AdminSessionSchema.parse(value) : undefined;
}

// --- StartggIntegrationConfig (singleton) ---

export async function saveStartggConfig(
  config: StartggIntegrationConfig,
): Promise<StartggIntegrationConfig> {
  const validated = StartggIntegrationConfigSchema.parse(config);
  const db = await getDb();
  await db.put("startggConfig", validated, SINGLETON_KEY);
  return validated;
}

export async function getStartggConfig(): Promise<
  StartggIntegrationConfig | undefined
> {
  const db = await getDb();
  const value = await db.get("startggConfig", SINGLETON_KEY);
  return value ? StartggIntegrationConfigSchema.parse(value) : undefined;
}

// --- TournamentHistory ---

/**
 * ユーザーフィードバック(2026-10-18): 大会選択(TournamentDrillDown.tsx)の
 * たびに、選択した大会スラッグ/大会名を履歴として記録する(手入力・一覧
 * からの選択のいずれでも)。同じスラッグを選び直した場合はlastUsedAtだけ
 * 更新する(重複レコードを作らない)。
 */
export async function recordTournamentHistory(
  tournamentSlug: string,
  tournamentName: string,
): Promise<void> {
  const validated = TournamentHistoryEntrySchema.parse({
    tournamentSlug,
    tournamentName,
    lastUsedAt: new Date().toISOString(),
  });
  const db = await getDb();
  await db.put("tournamentHistory", validated);
}

/** 直近に使われた順(新しい順)の大会履歴一覧。 */
export async function getTournamentHistory(): Promise<
  TournamentHistoryEntry[]
> {
  const db = await getDb();
  const values = await db.getAll("tournamentHistory");
  return values
    .map((value) => TournamentHistoryEntrySchema.parse(value))
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

// --- SyncStatus ---

export async function saveSyncStatus(status: SyncStatus): Promise<SyncStatus> {
  const validated = SyncStatusSchema.parse(status);
  const db = await getDb();
  await db.put("syncStatus", validated);
  return validated;
}

export async function getSyncStatus(
  poolId: string,
): Promise<SyncStatus | undefined> {
  const db = await getDb();
  const value = await db.get("syncStatus", poolId);
  return value ? SyncStatusSchema.parse(value) : undefined;
}
