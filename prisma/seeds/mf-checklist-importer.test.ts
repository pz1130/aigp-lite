import { describe, it, expect } from "vitest";
import path from "node:path";

function makeClient() {
  const tables = {
    section: new Map(),
    consideration: new Map(),
    item: new Map(),
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
    mfChecklistSection: { upsert: upsert(tables.section, "num") },
    mfChecklistConsideration: { upsert: upsert(tables.consideration, "code") },
    mfChecklistItem: { upsert: upsert(tables.item, "code") },
    frameworkVersion: { upsert: async () => ({}) },
  } as never;
}

describe("seedMfChecklistCatalog", () => {
  it("imports 4/17/51 and is idempotent", async () => {
    const { seedMfChecklistCatalog } = await import("./mf-checklist-importer");
    const client = makeClient();
    const jsonPath = path.join(__dirname, "mf-checklist-catalog.json");

    const first = await seedMfChecklistCatalog(jsonPath, client);
    expect(first).toEqual({ sections: 4, considerations: 17, items: 51 });

    const afterFirst = {
      s: (client as never as { _tables: { section: Map<string, unknown> } })
        ._tables.section.size,
      c: (
        client as never as { _tables: { consideration: Map<string, unknown> } }
      )._tables.consideration.size,
      i: (client as never as { _tables: { item: Map<string, unknown> } })
        ._tables.item.size,
    };
    await seedMfChecklistCatalog(jsonPath, client);
    const afterSecond = {
      s: (client as never as { _tables: { section: Map<string, unknown> } })
        ._tables.section.size,
      c: (
        client as never as { _tables: { consideration: Map<string, unknown> } }
      )._tables.consideration.size,
      i: (client as never as { _tables: { item: Map<string, unknown> } })
        ._tables.item.size,
    };
    expect(afterSecond).toEqual(afterFirst);
    expect(afterFirst).toEqual({ s: 4, c: 17, i: 51 });
  });
});
