import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    aivtfPrinciple: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "p1",
          num: 1,
          key: "transparency",
          title: "Transparency",
          blurb: null,
          order: 1,
          outcomes: [
            {
              id: "o1",
              code: "1.1",
              text: "Disclosure",
              order: 1,
              processes: [
                {
                  id: "pr1",
                  code: "1.1.1",
                  text: "Policy",
                  typeOfAI: "ALL",
                  evidenceType: "Doc",
                  evidenceGuidance: null,
                  order: 1,
                },
              ],
            },
          ],
        },
      ]),
    },
  },
}));

describe("getCatalog", () => {
  it("returns principles with nested outcomes/processes and a flat process count", async () => {
    const { getCatalog, countProcesses } = await import("./catalog");
    const cat = await getCatalog();
    expect(cat[0].key).toBe("transparency");
    expect(cat[0].outcomes[0].processes[0].code).toBe("1.1.1");
    expect(countProcesses(cat)).toBe(1);
  });
});
