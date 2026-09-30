import { describe, it, expect, vi } from "vitest";
import { recordFrameworkVersion } from "./framework-version";

describe("recordFrameworkVersion", () => {
  it("upserts one row keyed by framework, setting version + itemCount on both create and update", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const client = { frameworkVersion: { upsert } } as never;

    await recordFrameworkVersion(client, {
      framework: "AIVTF",
      version: "process-checklist-v1",
      itemCount: 11,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { framework: "AIVTF" },
      create: {
        framework: "AIVTF",
        version: "process-checklist-v1",
        itemCount: 11,
      },
      update: { version: "process-checklist-v1", itemCount: 11 },
    });
  });
});
