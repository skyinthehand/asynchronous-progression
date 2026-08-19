import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { AdminSession } from "../../domain/entities/adminSession.js";
import type { Entrant } from "../../domain/entities/entrant.js";
import type { MatchCard } from "../../domain/entities/matchCard.js";
import type { Notice } from "../../domain/entities/notice.js";
import type { Pool } from "../../domain/entities/pool.js";
import type { StaffAssignmentEntry } from "../../domain/entities/staffAssignment.js";
import type { StartggIntegrationConfig } from "../../domain/entities/startggConfig.js";
import type { SyncStatus } from "../../domain/entities/syncStatus.js";

const DB_NAME = "pool-progression-tracker";
const DB_VERSION = 1;

/** Singleton stores (adminSession, startggConfig) always use this key. */
export const SINGLETON_KEY = "current";

interface PoolProgressionDB extends DBSchema {
  pools: { key: string; value: Pool };
  matchCards: { key: string; value: MatchCard; indexes: { poolId: string } };
  entrants: { key: string; value: Entrant; indexes: { poolId: string } };
  staffAssignments: {
    key: number;
    value: StaffAssignmentEntry;
    indexes: { poolId: string };
  };
  notice: { key: string; value: Notice };
  adminSession: { key: string; value: AdminSession };
  startggConfig: { key: string; value: StartggIntegrationConfig };
  syncStatus: { key: string; value: SyncStatus };
}

let dbPromise: Promise<IDBPDatabase<PoolProgressionDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<PoolProgressionDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PoolProgressionDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pools")) {
          db.createObjectStore("pools", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("matchCards")) {
          const store = db.createObjectStore("matchCards", { keyPath: "id" });
          store.createIndex("poolId", "poolId");
        }
        if (!db.objectStoreNames.contains("entrants")) {
          const store = db.createObjectStore("entrants", { keyPath: "id" });
          store.createIndex("poolId", "poolId");
        }
        if (!db.objectStoreNames.contains("staffAssignments")) {
          const store = db.createObjectStore("staffAssignments", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("poolId", "poolId");
        }
        if (!db.objectStoreNames.contains("notice")) {
          db.createObjectStore("notice", { keyPath: "tournamentSlug" });
        }
        if (!db.objectStoreNames.contains("adminSession")) {
          db.createObjectStore("adminSession");
        }
        if (!db.objectStoreNames.contains("startggConfig")) {
          db.createObjectStore("startggConfig");
        }
        if (!db.objectStoreNames.contains("syncStatus")) {
          db.createObjectStore("syncStatus", { keyPath: "poolId" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * 管理画面の「リセット」ボタン用: ログイン状態・start.gg連携設定・
 * 同期済みのプールデータを含む、全ストアの内容を消去する。
 * `indexedDB.deleteDatabase()`は、既存の接続がすべて閉じるまで処理が
 * 保留(blocked)される・再度開き直す手順が別途必要、といった扱いにくさが
 * あるため使わない。各ストアを`clear()`する方式にすれば、開いたままの
 * 接続をそのまま使い続けられ、テストの`resetDb()`ヘルパーと同じ確実な
 * 方式で全データを消去できる。
 */
export async function resetAllData(): Promise<void> {
  const db = await getDb();
  for (const name of db.objectStoreNames) {
    const tx = db.transaction(name, "readwrite");
    await tx.store.clear();
    await tx.done;
  }
}

export type { PoolProgressionDB };
