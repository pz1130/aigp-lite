import { describe, it, expect } from "vitest";
import { validateOutput, type ValidateInput } from "./validate";

const openedAt = new Date("2026-05-25T00:00:00Z");
const now = new Date("2026-05-25T20:00:00Z");

function input(over: Partial<ValidateInput> = {}): ValidateInput {
  return {
    raw: {
      summary: "Valid summary text long enough to pass schema bound.",
      rootCause: "Valid root cause text long enough to pass schema bound.",
      timeline: [],
      recommendations: [],
    },
    openedAt,
    now,
    ...over,
  };
}

describe("validateOutput", () => {
  it("passes a clean entry through", () => {
    const r = validateOutput(
      input({
        raw: {
          ...input().raw,
          timeline: [
            {
              at: "2026-05-25T05:00:00Z",
              event: "ev",
              source: "audit" as const,
            },
          ],
        },
      }),
    );
    expect(r.status).toBe("ok");
    expect(r.timeline).toHaveLength(1);
  });

  it("drops timeline entries with invalid 'at'", () => {
    const r = validateOutput(
      input({
        raw: {
          ...input().raw,
          timeline: [
            { at: "not-a-date", event: "ev", source: "audit" as const },
          ],
        },
      }),
    );
    expect(r.timeline).toHaveLength(0);
    expect(
      r.diagnostics.find((d) => d.code === "timeline_at_invalid"),
    ).toBeTruthy();
    expect(r.status).toBe("needs_review");
  });

  it("drops timeline entries earlier than openedAt - 7d", () => {
    const r = validateOutput(
      input({
        raw: {
          ...input().raw,
          timeline: [
            {
              at: "2026-05-01T00:00:00Z",
              event: "ev",
              source: "audit" as const,
            },
          ],
        },
      }),
    );
    expect(r.timeline).toHaveLength(0);
    expect(
      r.diagnostics.find((d) => d.code === "timeline_out_of_range"),
    ).toBeTruthy();
  });

  it("drops timeline entries later than now + 1h", () => {
    const r = validateOutput(
      input({
        raw: {
          ...input().raw,
          timeline: [
            {
              at: "2026-05-26T00:00:00Z",
              event: "ev",
              source: "audit" as const,
            },
          ],
        },
      }),
    );
    expect(r.timeline).toHaveLength(0);
    expect(
      r.diagnostics.find((d) => d.code === "timeline_out_of_range"),
    ).toBeTruthy();
  });

  it("status=failed when summary is empty / whitespace", () => {
    const r = validateOutput({
      raw: {
        summary: "                    ",
        rootCause: "long rootCause text passes schema",
        timeline: [],
        recommendations: [],
      },
      openedAt,
      now,
    });
    expect(r.status).toBe("failed");
    expect(r.diagnostics.find((d) => d.code === "empty_output")).toBeTruthy();
  });

  it("status=needs_review when extra diagnostic was passed in from earlier stage", () => {
    const r = validateOutput({
      ...input(),
      preDiagnostics: [
        { code: "audit_truncated", message: "tail capped at 4000 chars" },
      ],
    } as ValidateInput);
    expect(r.status).toBe("needs_review");
    expect(
      r.diagnostics.find((d) => d.code === "audit_truncated"),
    ).toBeTruthy();
  });
});
