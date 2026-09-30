import { describe, it, expect } from "vitest";
import { attachmentDisposition } from "./content-disposition";

describe("attachmentDisposition", () => {
  it("leaves a plain ASCII filename intact in both forms", () => {
    const v = attachmentDisposition("aivtf-org-v3.xlsx");
    expect(v).toBe(
      "attachment; filename=\"aivtf-org-v3.xlsx\"; filename*=UTF-8''aivtf-org-v3.xlsx",
    );
  });

  it("sanitizes non-ASCII in the fallback but preserves it UTF-8 encoded", () => {
    const v = attachmentDisposition("fria-客户系统-v2.pdf");
    // ASCII fallback: each non-ASCII char becomes a single underscore.
    expect(v).toContain('filename="fria-____-v2.pdf"');
    // Precise form: percent-encoded UTF-8.
    expect(v).toContain(
      `filename*=UTF-8''${encodeURIComponent("fria-客户系统-v2.pdf")}`,
    );
  });

  it("neutralizes quotes and backslashes so the quoted form stays well-formed", () => {
    const v = attachmentDisposition('a"b\\c.pdf');
    expect(v).toContain('filename="a_b_c.pdf"');
  });
});
