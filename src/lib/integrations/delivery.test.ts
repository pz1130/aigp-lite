import { describe, it, expect, vi, beforeEach } from "vitest";
import { signPayload, deliverEvent, deliverToOrg } from "./delivery";

// deliverEvent now routes through the real egress guard; pin DNS to a public
// IP so hostname fixtures don't hit the network.
vi.mock("node:dns/promises", () => {
  const lookup = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { default: { lookup }, lookup };
});

describe("webhook delivery", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("signPayload", () => {
    it("returns a hex HMAC-SHA256 signature", () => {
      const payload = {
        event: "test",
        timestamp: "2026-05-16T00:00:00Z",
        orgId: "org1",
        data: {},
      };
      const sig = signPayload(payload, "secret123");
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different signatures for different secrets", () => {
      const payload = {
        event: "test",
        timestamp: "2026-05-16T00:00:00Z",
        orgId: "org1",
        data: {},
      };
      const sig1 = signPayload(payload, "secret1");
      const sig2 = signPayload(payload, "secret2");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("deliverEvent", () => {
    it("POSTs to the URL with signature headers", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const payload = {
        event: "usecase.approved",
        timestamp: "2026-05-16T00:00:00Z",
        orgId: "org1",
        data: { usecaseId: "u1" },
      };
      await deliverEvent("https://example.com/webhook", payload, "mysecret");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-AIGP-Signature": signPayload(payload, "mysecret"),
            "X-AIGP-Event": "usecase.approved",
            "X-AIGP-Timestamp": "2026-05-16T00:00:00Z",
          }),
        }),
      );
    });

    it("throws on non-2xx response", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      } as Response);

      const payload = {
        event: "test",
        timestamp: "2026-05-16T00:00:00Z",
        orgId: "org1",
        data: {},
      };
      await expect(
        deliverEvent("https://example.com/bad", payload, "secret"),
      ).rejects.toThrow("Webhook delivery failed: 502 Bad Gateway");
    });

    it("never calls fetch for a blocked destination", async () => {
      const payload = {
        event: "test",
        timestamp: "2026-05-16T00:00:00Z",
        orgId: "org1",
        data: {},
      };
      await expect(
        deliverEvent("http://169.254.169.254/hook", payload, "secret"),
      ).rejects.toThrow(/Egress blocked/);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("deliverToOrg", () => {
    it("only delivers to enabled endpoints matching the event", async () => {
      const endpoints = [
        {
          id: "1",
          url: "https://e1.com/h",
          secret: "s1",
          events: ["usecase.approved"],
          enabled: true,
        },
        {
          id: "2",
          url: "https://e2.com/h",
          secret: "s2",
          events: ["usecase.approved"],
          enabled: false,
        },
        {
          id: "3",
          url: "https://e3.com/h",
          secret: "s3",
          events: ["usecase.rejected"],
          enabled: true,
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await deliverToOrg(endpoints, "usecase.approved", "org1", {
        usecaseId: "u1",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
        "https://e1.com/h",
      );
    });

    it("does not throw if a delivery fails — errors are caught and logged", async () => {
      const endpoints = [
        {
          id: "1",
          url: "https://bad.com/h",
          secret: "s1",
          events: ["usecase.approved"],
          enabled: true,
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("network error"),
      );

      // Should not throw
      await expect(
        deliverToOrg(endpoints, "usecase.approved", "org1", {
          usecaseId: "u1",
        }),
      ).resolves.not.toThrow();
    });

    it("a blocked endpoint does not stop delivery to other endpoints", async () => {
      const endpoints = [
        {
          id: "1",
          url: "http://10.0.0.1/h",
          secret: "s1",
          events: ["usecase.approved"],
          enabled: true,
        },
        {
          id: "2",
          url: "https://e2.com/h",
          secret: "s2",
          events: ["usecase.approved"],
          enabled: true,
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await expect(
        deliverToOrg(endpoints, "usecase.approved", "org1", {}),
      ).resolves.not.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
        "https://e2.com/h",
      );
    });
  });
});
