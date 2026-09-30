import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, cookieGetMock, findFirstMock, findManyMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    cookieGetMock: vi.fn(),
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
  }),
);

vi.mock("./auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    membership: {
      findFirst: findFirstMock,
      findMany: findManyMock,
    },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}));

import { getSessionContext, getUserOrganizations } from "./session";

describe("session organization context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    cookieGetMock.mockReturnValue(undefined);
  });

  it("uses the active organization cookie when it belongs to the user", async () => {
    findFirstMock.mockResolvedValue({ orgId: "org-2", role: "viewer" });

    const context = await getSessionContext();

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { joinedAt: "asc" },
    });

    cookieGetMock.mockReturnValue({ value: "org-2" });
    await getSessionContext();

    expect(findFirstMock).toHaveBeenLastCalledWith({
      where: { userId: "user-1", orgId: "org-2" },
      orderBy: { joinedAt: "asc" },
    });
    expect(context?.orgId).toBe("org-2");
  });

  it("falls back to the earliest membership when the active cookie is stale", async () => {
    cookieGetMock.mockReturnValue({ value: "org-not-owned" });
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ orgId: "org-1", role: "admin" });

    const context = await getSessionContext();

    expect(findFirstMock).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1", orgId: "org-not-owned" },
      orderBy: { joinedAt: "asc" },
    });
    expect(findFirstMock).toHaveBeenNthCalledWith(2, {
      where: { userId: "user-1" },
      orderBy: { joinedAt: "asc" },
    });
    expect(context?.orgId).toBe("org-1");
  });

  it("returns the user's organizations with their roles", async () => {
    findManyMock.mockResolvedValue([
      { org: { id: "org-1", name: "First" }, role: "admin" },
      { org: { id: "org-2", name: "Second" }, role: "viewer" },
    ]);

    await expect(getUserOrganizations("user-1")).resolves.toEqual([
      { id: "org-1", name: "First", role: "admin" },
      { id: "org-2", name: "Second", role: "viewer" },
    ]);
  });
});
