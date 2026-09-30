import http from "node:http";
import { getConnection } from "@/lib/jobs/connection";
import { readHeartbeat, isStale } from "@/lib/jobs/heartbeat";

/**
 * Liveness probe for the worker process. A k8s `livenessProbe` / docker
 * `HEALTHCHECK` can hit `GET /healthz`: 200 while the worker writes fresh
 * heartbeats, 503 once they go stale (Redis dropped, event loop wedged, process
 * dying). Deliberately dependency-free — `node:http` + one Redis read. Never
 * import this into the Next.js build; it lives in src/worker/ and runs only in
 * the worker process.
 */

/**
 * Max heartbeat age before the worker is reported stale. The worker refreshes the
 * heartbeat every ~15s, so 90s tolerates a few missed beats before alarming.
 */
export const HEALTH_STALE_MS = 90_000;

async function currentStatus(): Promise<{ ok: boolean; heartbeat: unknown }> {
  const conn = getConnection();
  const hb = conn ? await readHeartbeat(conn) : null;
  return { ok: !isStale(hb, HEALTH_STALE_MS), heartbeat: hb };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Start the liveness server. Pass 0 for an ephemeral port (tests). */
export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/healthz") {
      send(res, 404, { status: "not_found" });
      return;
    }
    void currentStatus()
      .then(({ ok, heartbeat }) =>
        ok
          ? send(res, 200, { status: "ok", heartbeat })
          : send(res, 503, { status: "stale" }),
      )
      .catch(() => send(res, 503, { status: "stale" }));
  });
  server.listen(port);
  return server;
}
