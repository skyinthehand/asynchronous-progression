import { describe, expect, it } from "vitest";
import type { Entrant } from "../../../../src/domain/entities/entrant.js";
import { generateRoundRobinMatchCards } from "../../../../src/domain/rules/roundRobinGenerator.js";

function makeEntrant(id: string): Entrant {
  return {
    id,
    poolId: "pool-1",
    name: `Player ${id}`,
    attendance: "UNKNOWN",
    attendanceRecordedAt: null,
    poolFinished: false,
    nextMatch: null,
    awayPeriods: [],
  };
}

describe("generateRoundRobinMatchCards", () => {
  it("generates no cards for fewer than two entrants", () => {
    expect(generateRoundRobinMatchCards("pool-1", [])).toHaveLength(0);
    expect(
      generateRoundRobinMatchCards("pool-1", [makeEntrant("1")]),
    ).toHaveLength(0);
  });

  it("generates exactly n*(n-1)/2 cards for an even number of entrants", () => {
    const entrants = ["1", "2", "3", "4"].map(makeEntrant);
    const cards = generateRoundRobinMatchCards("pool-1", entrants);
    expect(cards).toHaveLength(6);
  });

  it("generates exactly n*(n-1)/2 cards for an odd number of entrants (BYE)", () => {
    const entrants = ["1", "2", "3", "4", "5"].map(makeEntrant);
    const cards = generateRoundRobinMatchCards("pool-1", entrants);
    expect(cards).toHaveLength(10);
  });

  it("pairs every entrant against every other entrant exactly once", () => {
    const entrants = ["1", "2", "3", "4", "5"].map(makeEntrant);
    const cards = generateRoundRobinMatchCards("pool-1", entrants);
    const pairs = new Set(
      cards.map((card) => [card.entrant1Id, card.entrant2Id].sort().join("-")),
    );
    expect(pairs.size).toBe(cards.length);

    for (const a of entrants) {
      for (const b of entrants) {
        if (a.id === b.id) continue;
        const key = [a.id, b.id].sort().join("-");
        expect(pairs.has(key)).toBe(true);
      }
    }
  });

  it("marks generated cards as not started and pending local sync", () => {
    const entrants = ["1", "2"].map(makeEntrant);
    const [card] = generateRoundRobinMatchCards("pool-1", entrants);
    expect(card.status).toBe("NOT_STARTED");
    expect(card.localOnly).toBe(true);
    expect(card.bracketSide).toBe("N/A");
  });
});
