import { describe, it, expect } from "vitest";
import { z } from "zod";
import { jsonResponseFormat } from "./response-format";

describe("jsonResponseFormat", () => {
  const schema = z.object({
    title: z.string().min(1).max(80),
    score: z.number().min(0).max(1),
    tags: z.array(z.string().max(10)).max(5).default([]),
    level: z.enum(["low", "high"]),
    // A field literally named like a stripped keyword must survive.
    default: z.string().optional(),
  });

  it("emits a closed object schema without unsupported keywords", () => {
    const rf = jsonResponseFormat("thing", schema);
    expect(rf.name).toBe("thing");
    expect(rf.schema).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        score: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        level: { type: "string", enum: ["low", "high"] },
        default: { type: "string" },
      },
      required: ["title", "score", "level"],
      additionalProperties: false,
    });
  });

  it("keeps defaulted fields optional", () => {
    const rf = jsonResponseFormat("thing", schema);
    expect(rf.schema.required).not.toContain("tags");
  });
});
