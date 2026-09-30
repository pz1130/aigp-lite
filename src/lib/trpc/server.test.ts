import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { appRouter } from "@/lib/trpc/router";
import type { TRPCContext } from "@/lib/trpc/server";
import { prisma } from "@/lib/db";

// --- Mock Sentry and metrics -----------------------------------------------
// hoisted() runs at module-load time (before vi.mock replaces the imports),
// so these are the real mocks that vi.mock returns.
const { startSpanMock, countMock } = vi.hoisted(() => {
  return {
    startSpanMock: vi.fn((opts: unknown, fn: () => unknown) => {
      return fn();
    }),
    countMock: vi.fn(),
  };
});

vi.mock("@sentry/nextjs", () => ({ startSpan: startSpanMock }));
// `metric` is an alias of `count` (see observability/metrics); enqueueJob calls
// it on the Redis-present path, and `distribution` is used elsewhere — expose
// both so the queue branch doesn't blow up when Redis is available.
vi.mock("@/lib/observability/metrics", () => ({
  count: countMock,
  metric: countMock,
  distribution: vi.fn(),
}));

let orgId: string;
let userId: string;

function makeCtx(uid: string, oid: string): TRPCContext {
  return {
    session: {
      userId: uid,
      orgId: oid,
      role: "admin",
      email: `${uid}@x`,
    },
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `SentrySpanT ${Date.now()}` },
  });
  orgId = org.id;
  const u = await prisma.user.create({
    data: { email: `u-${Date.now()}@x`, name: "U", passwordHash: "x" },
  });
  userId = u.id;
  await prisma.membership.create({
    data: { orgId, userId, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.incident.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

beforeEach(() => {
  startSpanMock.mockClear();
  countMock.mockClear();
});

describe("Sentry span middleware on tRPC procedures", () => {
  it("calls Sentry.startSpan with path and op='trpc' on success", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const result = await caller.audit.list({ cursor: undefined, limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(
      { name: "audit.list", op: "trpc", attributes: expect.any(Object) },
      expect.any(Function),
    );
  });

  it("adds org attribute to the span options when ctx.session.orgId is set", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    await caller.audit.list({ cursor: undefined, limit: 10 });

    const [opts] = startSpanMock.mock.calls[0] as unknown as [
      { name: string; attributes?: Record<string, string> },
    ];
    expect(opts.attributes).toMatchObject({ org: orgId });
  });

  it("does NOT alter the return value when Sentry is mocked", async () => {
    const caller = appRouter.createCaller(makeCtx(userId, orgId));
    const result = await caller.audit.list({ cursor: undefined, limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("calls count('trpc.error', { path }) when next() returns result.ok=false and still propagates the error", async () => {
    // A protected procedure call without a session returns result.ok=false.
    // The span middleware must call count AND still return the error so the caller throws.
    const ctxWithNoSession: TRPCContext = { session: null as null };
    const caller = appRouter.createCaller(
      ctxWithNoSession as unknown as TRPCContext,
    );

    await expect(
      caller.audit.list({ cursor: undefined, limit: 10 }),
    ).rejects.toThrow();

    expect(countMock).toHaveBeenCalledTimes(1);
    const [name, tags] = countMock.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(name).toBe("trpc.error");
    expect(tags.path).toMatch(/audit\.list/);
  });
});
