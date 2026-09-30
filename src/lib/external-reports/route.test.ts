import { describe, it, expect, vi } from "vitest";
import { handleSubmission } from "@/app/api/external-reports/route";
import { signRenderedAt } from "./anti-abuse";

const NOW = 2_000_000_000_000;
const body = (over: Record<string, unknown> = {}) => ({
  token: "tok-abc",
  type: "vulnerability",
  title: "t",
  description: "d",
  reproSteps: "",
  website: "",
  renderedAt: signRenderedAt(NOW - 5000),
  ...over,
});

const deps = {
  resolve: vi.fn(async (t: string) =>
    t === "tok-abc" ? { id: "u1", orgId: "o1", name: "Sys" } : null,
  ),
  create: vi.fn(async () => ({ id: "er1" })),
  now: () => NOW,
};

describe("handleSubmission", () => {
  it("returns 200 + ok for a valid submission", async () => {
    const r = await handleSubmission(body(), deps);
    expect(r.status).toBe(200);
    expect(deps.create).toHaveBeenCalled();
  });

  it("returns silent 200 for honeypot without persisting", async () => {
    deps.create.mockClear();
    const r = await handleSubmission(body({ website: "x" }), deps);
    expect(r.status).toBe(200);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid fields", async () => {
    const r = await handleSubmission(body({ title: "" }), deps);
    expect(r.status).toBe(400);
  });

  it("returns 404 for an unknown token", async () => {
    const r = await handleSubmission(body({ token: "nope" }), deps);
    expect(r.status).toBe(404);
  });
});
