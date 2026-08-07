import { type Entrant, EntrantSchema } from "../../domain/schemas/entrant.js";
import { getDb } from "./db.js";

export async function saveEntrant(entrant: Entrant): Promise<Entrant> {
  const validated = EntrantSchema.parse(entrant);
  const db = await getDb();
  await db.put("entrants", validated);
  return validated;
}

export async function saveEntrants(entrants: Entrant[]): Promise<Entrant[]> {
  const db = await getDb();
  const tx = db.transaction("entrants", "readwrite");
  const validated = entrants.map((entrant) => EntrantSchema.parse(entrant));
  await Promise.all(validated.map((entrant) => tx.store.put(entrant)));
  await tx.done;
  return validated;
}

export async function getEntrant(id: string): Promise<Entrant | undefined> {
  const db = await getDb();
  const value = await db.get("entrants", id);
  return value ? EntrantSchema.parse(value) : undefined;
}

export async function getEntrantsByPool(poolId: string): Promise<Entrant[]> {
  const db = await getDb();
  const values = await db.getAllFromIndex("entrants", "poolId", poolId);
  return values.map((value) => EntrantSchema.parse(value));
}
