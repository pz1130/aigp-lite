import { router, orgProcedure } from "@/lib/trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { encryptJson } from "@/lib/crypto/secrets";
import type { Prisma } from "@/lib/prisma";
import { recordSnapshot } from "./snapshots";
import { diffSnapshots, type McpToolDescriptor } from "./drift";

/** Accept a bare tools array, {tools:[...]}, or a full JSON-RPC envelope. */
function extractTools(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.tools)) return o.tools;
    const result = o.result as Record<string, unknown> | undefined;
    if (result && Array.isArray(result.tools)) return result.tools;
  }
  return parsed;
}

function stripAuthToken<T extends { authTokenEnc?: Uint8Array | null }>(
  row: T,
): Omit<T, "authTokenEnc"> & { hasAuthToken: boolean } {
  const { authTokenEnc, ...rest } = row;
  return { ...rest, hasAuthToken: !!authTokenEnc };
}

export const mcpRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: z.enum(["active", "inactive", "archived"]).optional(),
          riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.mcpServer.findMany({
        where: {
          orgId: ctx.session.orgId,
          ...(input?.status && { status: input.status }),
          ...(input?.riskTier && { riskTier: input.riskTier }),
        },
        include: { _count: { select: { tools: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(stripAuthToken);
    }),

  byId: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.mcpServer.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
        include: {
          tools: { orderBy: { name: "asc" } },
          invocations: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      return row ? stripAuthToken(row) : null;
    }),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        endpoint: z.string().min(1).max(500),
        transport: z.enum(["stdio", "http"]),
        authType: z.enum(["none", "token", "oauth"]).default("none"),
        riskTier: z
          .enum(["low", "medium", "high", "critical"])
          .default("medium"),
        owner: z.string().max(200).optional(),
        notes: z.string().max(5000).optional(),
        authToken: z.string().min(1).max(500).optional(),
        tools: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().max(2000).optional(),
              riskTier: z
                .enum(["low", "medium", "high", "critical"])
                .optional(),
              inputSchema: z.unknown().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.write");
      const { tools, authToken, ...serverData } = input;
      const server = await ctx.db.mcpServer.create({
        data: {
          ...serverData,
          orgId: ctx.session.orgId,
          createdById: ctx.session.userId,
          ...(authToken && {
            authTokenEnc: new Uint8Array(encryptJson(authToken)),
          }),
          tools: tools
            ? {
                create: tools.map((t) => ({
                  orgId: ctx.session.orgId,
                  name: t.name,
                  description: t.description,
                  riskTier: t.riskTier ?? input.riskTier,
                  inputSchema: t.inputSchema as Prisma.InputJsonValue,
                })),
              }
            : undefined,
        },
        include: { tools: true },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mcp.create",
        resourceType: "mcp_server",
        resourceId: server.id,
        after: { name: server.name, toolCount: server.tools.length },
      });
      return stripAuthToken(server);
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        endpoint: z.string().min(1).max(500).optional(),
        transport: z.enum(["stdio", "http"]).optional(),
        authType: z.enum(["none", "token", "oauth"]).optional(),
        riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
        owner: z.string().max(200).optional(),
        notes: z.string().max(5000).optional(),
        authToken: z.string().min(1).max(500).optional(),
        tools: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().max(2000).optional(),
              riskTier: z
                .enum(["low", "medium", "high", "critical"])
                .optional(),
              inputSchema: z.unknown().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.write");
      const { id, tools, authToken, ...serverData } = input;

      const existing = await ctx.db.mcpServer.findFirst({
        where: { id, orgId: ctx.session.orgId },
      });
      if (!existing) throw new Error("Server not found");

      if (tools) {
        await ctx.db.mcpTool.deleteMany({ where: { serverId: id } });
        if (tools.length > 0) {
          await ctx.db.mcpTool.createMany({
            data: tools.map((t) => ({
              serverId: id,
              orgId: ctx.session.orgId,
              name: t.name,
              description: t.description,
              riskTier: t.riskTier ?? existing.riskTier,
              inputSchema: t.inputSchema as Prisma.InputJsonValue,
            })),
          });
        }
      }

      const server = await ctx.db.mcpServer.update({
        where: { id },
        data: {
          ...serverData,
          ...(authToken && {
            authTokenEnc: new Uint8Array(encryptJson(authToken)),
          }),
        },
        include: { tools: { orderBy: { name: "asc" } } },
      });

      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mcp.update",
        resourceType: "mcp_server",
        resourceId: id,
        before: { name: existing.name },
        after: { name: server.name },
      });
      return stripAuthToken(server);
    }),

  remove: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.delete");
      const server = await ctx.db.mcpServer.findFirst({
        where: { id: input.id, orgId: ctx.session.orgId },
      });
      if (!server) throw new Error("Server not found");

      const updated = await ctx.db.mcpServer.update({
        where: { id: input.id },
        data: { status: "archived" },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mcp.archive",
        resourceType: "mcp_server",
        resourceId: input.id,
        before: { status: server.status },
        after: { status: "archived" },
      });
      return stripAuthToken(updated);
    }),

  logInvocation: orgProcedure
    .input(
      z.object({
        serverId: z.string(),
        toolName: z.string().min(1).max(200),
        outcome: z.enum(["success", "failure", "denied"]),
        consentGiven: z.boolean().default(true),
        inputSummary: z.string().max(2000).optional(),
        outputSummary: z.string().max(2000).optional(),
        latencyMs: z.number().int().optional(),
        errorMessage: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.write");
      const tool = await ctx.db.mcpTool.findFirst({
        where: {
          serverId: input.serverId,
          name: input.toolName,
          orgId: ctx.session.orgId,
        },
      });
      const invocation = await ctx.db.mcpToolInvocation.create({
        data: {
          orgId: ctx.session.orgId,
          serverId: input.serverId,
          toolId: tool?.id ?? null,
          toolName: input.toolName,
          actorId: ctx.session.userId,
          outcome: input.outcome,
          consentGiven: input.consentGiven,
          inputSummary: input.inputSummary,
          outputSummary: input.outputSummary,
          latencyMs: input.latencyMs,
          errorMessage: input.errorMessage,
        },
      });
      return invocation;
    }),

  invocations: orgProcedure
    .input(
      z.object({
        serverId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.mcpToolInvocation.findMany({
        where: { orgId: ctx.session.orgId, serverId: input.serverId },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const nextCursor =
        items.length > input.limit ? items.pop()!.id : undefined;
      return { items, nextCursor };
    }),

  listSnapshots: orgProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.mcpToolSnapshot.findMany({
        where: { serverId: input.serverId, orgId: ctx.session.orgId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          toolsHash: true,
          source: true,
          createdAt: true,
          capturedBy: { select: { name: true, email: true } },
        },
      });
    }),

  submitSnapshot: orgProcedure
    .input(
      z.object({ serverId: z.string(), toolsJson: z.string().max(500_000) }),
    )
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.write");
      let tools: unknown;
      try {
        const parsed: unknown = JSON.parse(input.toolsJson);
        tools = extractTools(parsed);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "invalid tools/list JSON",
        });
      }
      try {
        return await recordSnapshot({
          serverId: input.serverId,
          orgId: ctx.session.orgId,
          tools,
          source: "manual",
          capturedById: ctx.session.userId,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "invalid tools payload") {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
    }),

  pendingDiff: orgProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ ctx, input }) => {
      const server = await ctx.db.mcpServer.findFirst({
        where: {
          id: input.serverId,
          orgId: ctx.session.orgId,
          driftStatus: "pending_review",
        },
        include: { baselineSnapshot: true },
      });
      if (!server?.baselineSnapshot) return null;
      const latest = await ctx.db.mcpToolSnapshot.findFirst({
        where: { serverId: server.id, orgId: ctx.session.orgId },
        orderBy: { createdAt: "desc" },
      });
      if (!latest || latest.id === server.baselineSnapshotId) return null;
      return diffSnapshots(
        server.baselineSnapshot.toolsJson as unknown as McpToolDescriptor[],
        latest.toolsJson as unknown as McpToolDescriptor[],
      );
    }),

  approveBaseline: orgProcedure
    .input(z.object({ serverId: z.string(), snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPermission(ctx.session.role, "mcp.write");
      const snapshot = await ctx.db.mcpToolSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          serverId: input.serverId,
          orgId: ctx.session.orgId,
        },
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });
      const server = await ctx.db.mcpServer.findFirstOrThrow({
        where: { id: input.serverId, orgId: ctx.session.orgId },
      });
      await ctx.db.mcpServer.update({
        where: { id: server.id },
        data: { baselineSnapshotId: snapshot.id, driftStatus: "none" },
      });
      await writeAudit({
        orgId: ctx.session.orgId,
        actorId: ctx.session.userId,
        action: "mcp.drift.baselineApproved",
        resourceType: "mcp_server",
        resourceId: server.id,
        before: { baselineSnapshotId: server.baselineSnapshotId },
        after: {
          baselineSnapshotId: snapshot.id,
          toolsHash: snapshot.toolsHash,
        },
      });
      return { ok: true };
    }),
});
