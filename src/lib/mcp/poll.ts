import { prisma } from "@/lib/db";
import { safeFetch } from "@/lib/egress/guard";
import { decryptJson } from "@/lib/crypto/secrets";
import { recordSnapshot } from "./snapshots";

/** JSON-RPC tools/list against a live http MCP server. Returns the raw tools array. */
export async function fetchLiveTools(server: {
  endpoint: string;
  authTokenEnc: Uint8Array | null;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (server.authTokenEnc) {
    headers.Authorization = `Bearer ${decryptJson<string>(server.authTokenEnc)}`;
  }
  const res = await safeFetch(server.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (!res.ok) throw new Error(`tools/list returned ${res.status}`);
  const body = (await res.json()) as { result?: { tools?: unknown } };
  if (!body.result || !Array.isArray(body.result.tools)) {
    throw new Error("tools/list response missing result.tools");
  }
  return body.result.tools;
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
