import type { AwayPeriod, Entrant } from "../entities/entrant.js";

/** 出場者が現在離席中であれば、その離席期間(終了していないもの)を返す。 */
export function currentAwayPeriod(entrant: Entrant): AwayPeriod | undefined {
  return entrant.awayPeriods.find((period) => period.endedAt === null);
}

export function isEntrantAway(entrant: Entrant): boolean {
  return currentAwayPeriod(entrant) !== undefined;
}
