import {
  type MatchCard,
  MatchCardSchema,
} from "../../domain/schemas/matchCard.js";
import { getDb } from "./db.js";

export async function saveMatchCard(matchCard: MatchCard): Promise<MatchCard> {
  const validated = MatchCardSchema.parse(matchCard);
  const db = await getDb();
  await db.put("matchCards", validated);
  return validated;
}

export async function saveMatchCards(
  matchCards: MatchCard[],
): Promise<MatchCard[]> {
  const db = await getDb();
  const tx = db.transaction("matchCards", "readwrite");
  const validated = matchCards.map((card) => MatchCardSchema.parse(card));
  await Promise.all(validated.map((card) => tx.store.put(card)));
  await tx.done;
  return validated;
}

export async function getMatchCard(id: string): Promise<MatchCard | undefined> {
  const db = await getDb();
  const value = await db.get("matchCards", id);
  return value ? MatchCardSchema.parse(value) : undefined;
}

export async function getMatchCardsByPool(
  poolId: string,
): Promise<MatchCard[]> {
  const db = await getDb();
  const values = await db.getAllFromIndex("matchCards", "poolId", poolId);
  return values.map((value) => MatchCardSchema.parse(value));
}

export async function getPendingMatchCards(
  poolId: string,
): Promise<MatchCard[]> {
  const all = await getMatchCardsByPool(poolId);
  return all.filter((card) => card.localOnly || card.statusLocalOnly);
}

export async function deleteMatchCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("matchCards", "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}
