import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GET } from "./route";
import {
  recordTestEmail,
  clearTestOutbox,
} from "@/lib/notification/test-outbox";

function req(url: string): Request {
  return new Request(url);
}

describe("GET /api/test/outbox", () => {
  beforeEach(() => clearTestOutbox());
  afterEach(() => vi.unstubAllEnvs());

  it("404s in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(req("http://x/api/test/outbox?email=a@x.com"));
    expect(res.status).toBe(404);
  });

  it("400s when the email param is missing", async () => {
    const res = await GET(req("http://x/api/test/outbox"));
    expect(res.status).toBe(400);
  });

  it("404s when no email is captured for the address", async () => {
    const res = await GET(req("http://x/api/test/outbox?email=none@x.com"));
    expect(res.status).toBe(404);
  });

  it("returns the latest email plus the parsed url and token", async () => {
    recordTestEmail({
      to: "a@x.com",
      subject: "invite",
      body: "Accept the invite: http://localhost:3001/accept-invite?token=ABC123\n\nThis link expires on 2026-06-23.",
    });
    const res = await GET(req("http://x/api/test/outbox?email=a@x.com"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("ABC123");
    expect(json.url).toBe("http://localhost:3001/accept-invite?token=ABC123");
    expect(json.subject).toBe("invite");
  });
});
