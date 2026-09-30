import { describe, it, expect } from "vitest";
import path from "node:path";

function makeClient() {
  const tables = {
    principle: new Map(),
    outcome: new Map(),
    process: new Map(),
  };
  const upsert =
    (m: Map<string, unknown>, keyField: string) =>
    async ({
      where,
      create,
    }: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => {
      const k = String(where[keyField]);
      const row = m.get(k) ?? { id: `id-${keyField}-${k}` };
      m.set(k, { ...row, ...create });
      return m.get(k);
    };
  return {
    _tables: tables,
    aivtfPrinciple: { upsert: upsert(tables.principle, "num") },
    aivtfOutcome: { upsert: upsert(tables.outcome, "code") },
    aivtfProcess: { upsert: upsert(tables.process, "code") },
    // The importer records a framework version row at the end of a successful
    // import; the fake client must expose that delegate too.
    frameworkVersion: { upsert: async () => ({}) },
  } as never;
}

describe("seedAivtfCatalog", () => {
  it("imports 11/88/112 and is idempotent", async () => {
    const { seedAivtfCatalog } = await import("./aivtf-importer");
    const client = makeClient();
    const jsonPath = path.join(__dirname, "aivtf-catalog.json");

    const first = await seedAivtfCatalog(jsonPath, client);
    expect(first).toEqual({ principles: 11, outcomes: 88, processes: 112 });
    const afterFirst = {
      p: (client as never as { _tables: { principle: Map<string, unknown> } })
        ._tables.principle.size,
      o: (client as never as { _tables: { outcome: Map<string, unknown> } })
        ._tables.outcome.size,
      pr: (client as never as { _tables: { process: Map<string, unknown> } })
        ._tables.process.size,
    };
    await seedAivtfCatalog(jsonPath, client);
    const afterSecond = {
      p: (client as never as { _tables: { principle: Map<string, unknown> } })
        ._tables.principle.size,
      o: (client as never as { _tables: { outcome: Map<string, unknown> } })
        ._tables.outcome.size,
      pr: (client as never as { _tables: { process: Map<string, unknown> } })
        ._tables.process.size,
    };
    expect(afterSecond).toEqual(afterFirst);
    expect(afterFirst).toEqual({ p: 11, o: 88, pr: 112 });
  });
});
