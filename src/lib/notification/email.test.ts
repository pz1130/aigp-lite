import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { ConsoleEmailTransport, emailTransport } from "./email";
import { getLatestForEmail, clearTestOutbox } from "./test-outbox";
import { prisma } from "@/lib/db";

let userId: string;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: {
      email: `email-test-${Date.now()}@x.test`,
      name: "ET",
      passwordHash: "x",
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
});

describe("ConsoleEmailTransport", () => {
  it("resolves toUserId to email and logs the message", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = new ConsoleEmailTransport();
    const r = await t.send({
      toUserId: userId,
      subject: "Hello",
      textBody: "Body line 1\nBody line 2",
    });
    expect(r).toEqual({ ok: true, transportId: "console" });
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe("[email:stub]");
    expect(payload).toMatchObject({ subject: "Hello" });
    expect(payload.to).toMatch(/email-test-.*@x\.test/);
    spy.mockRestore();
  });

  it("falls back to <unknown> when user not found", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = new ConsoleEmailTransport();
    await t.send({ toUserId: "no-such-user", subject: "X", textBody: "Y" });
    expect(spy.mock.calls[0][1].to).toBe("<unknown>");
    spy.mockRestore();
  });

  it("sendByEmail logs the raw email address without touching the DB", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = new ConsoleEmailTransport();
    const r = await t.sendByEmail(
      "nobody@example.test",
      "Invite",
      "Click here: https://x/y",
    );
    expect(r).toEqual({ ok: true, transportId: "console" });
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe("[email:stub]");
    expect(payload).toMatchObject({
      to: "nobody@example.test",
      subject: "Invite",
    });
    spy.mockRestore();
  });
});

describe("ConsoleEmailTransport outbox capture", () => {
  beforeEach(() => clearTestOutbox());
  afterEach(() => vi.unstubAllEnvs());

  it("records the message into the outbox in test mode", async () => {
    await emailTransport.sendByEmail(
      "invitee@demo.local",
      "You've been invited",
      "Accept the invite: http://localhost:3001/accept-invite?token=RAWTOK",
    );
    const msg = getLatestForEmail("invitee@demo.local");
    expect(msg?.subject).toBe("You've been invited");
    expect(msg?.body).toContain("token=RAWTOK");
  });

  it("does NOT record when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await emailTransport.sendByEmail("prod@demo.local", "s", "b");
    expect(getLatestForEmail("prod@demo.local")).toBeUndefined();
  });
});
