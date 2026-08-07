import { type Pool, PoolSchema } from "../../domain/schemas/pool.js";
import { getDb } from "./db.js";

export async function savePool(pool: Pool): Promise<Pool> {
  const validated = PoolSchema.parse(pool);
  const db = await getDb();
  await db.put("pools", validated);
  return validated;
}

export async function getPool(id: string): Promise<Pool | undefined> {
  const db = await getDb();
  const value = await db.get("pools", id);
  return value ? PoolSchema.parse(value) : undefined;
}

export async function getAllPools(): Promise<Pool[]> {
  const db = await getDb();
  const values = await db.getAll("pools");
  return values.map((value) => PoolSchema.parse(value));
}
