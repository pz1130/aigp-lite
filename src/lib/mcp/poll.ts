import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/egress/guard";
import { decryptJson } from "@/lib/crypto/secrets";
import { recordSnapshot } from "./snapshots";

/** Guard against servers that hand out cursors forever. */
const MAX_PAGES = 50;

/**
 * Deliberately loose: drift detection fingerprints whatever the server
 * returns, so a tool that fails the SDK's strict Tool schema must still be
 * captured rather than rejected.
 */
const ToolsPageSchema = z.looseObject({
  tools: z.array(z.unknown()),
  nextCursor: z.string().optional(),
});

/**
 * Lists the tools of a live Streamable HTTP MCP server via the official SDK
 * client: initialize handshake, session / protocol-version headers, JSON or
 * SSE responses, and nextCursor pagination. Every request goes through the
 * egress guard. Returns the raw tools array.
 */
export async function fetchLiveTools(server: {
  endpoint: string;
  authTokenEnc: Uint8Array | null;
}): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (server.authTokenEnc) {
    headers.Authorization = `Bearer ${decryptJson<string>(server.authTokenEnc)}`;
  }
  const transport = new StreamableHTTPClientTransport(
    new URL(server.endpoint),
    {
      fetch: (url, init) => safeFetch(url.toString(), init),
      requestInit: { headers },
    },
  );
  const client = new Client({ name: "aigp-lite-drift", version: "1.0.0" });

  await client.connect(transport);
  try {
    const tools: unknown[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await client.request(
        { method: "tools/list", params: cursor ? { cursor } : {} },
        ToolsPageSchema,
      );
      tools.push(...res.tools);
      cursor = res.nextCursor;
      if (!cursor) return tools;
    }
    throw new Error(`tools/list exceeded ${MAX_PAGES} pages`);
  } finally {
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

/**
 * Daily sweep: poll every reachable registered server and run the snapshot
 * pipeline. Failures are isolated per server — operational noise, not drift.
 */
export async function sweepMcpDrift(): Promise<{
  polled: number;
  drifted: number;
  failed: number;
}> {
  const servers = await prisma.mcpServer.findMany({
    where: {
      transport: "http",
      status: "active",
      authType: { in: ["none", "token"] },
    },
    select: { id: true, orgId: true, endpoint: true, authTokenEnc: true },
  });

  let drifted = 0;
  let failed = 0;
  for (const server of servers) {
    try {
      const tools = await fetchLiveTools(server);
      const result = await recordSnapshot({
        serverId: server.id,
        orgId: server.orgId,
        tools,
        source: "polled",
      });
      if (result.outcome === "drift_detected") drifted++;
    } catch (err) {
      failed++;
      console.error(`[mcp-drift] poll failed for server ${server.id}:`, err);
    }
  }
  return { polled: servers.length, drifted, failed };
}
