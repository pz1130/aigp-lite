// Abort flags with Redis (REST) support for multi-replica deployments.
// Fallback: process-local map when Redis env is not configured.
const localAbortFlags = new Map<string, boolean>();
const KEY_PREFIX = "aigp:redteam:abort:";
const DEFAULT_TTL_SECONDS = 60 * 60;
let warnedRedisFallback = false;

function redisConfig() {
  const url = process.env.AIGP_ABORT_REDIS_REST_URL;
  const token = process.env.AIGP_ABORT_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redisCall(path: string): Promise<{ result: unknown } | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) throw new Error(`abort redis http ${res.status}`);
  return res.json() as Promise<{ result: unknown }>;
}

function warnRedisFallback(op: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!warnedRedisFallback) {
    warnedRedisFallback = true;
    console.warn(
      `[redteam-abort] Redis unavailable; falling back to process-local abort flags. op=${op} error=${msg}`,
    );
    return;
  }
  console.warn(
    `[redteam-abort] Redis call failed; using local fallback. op=${op} error=${msg}`,
  );
}

export const abortFlags = {
  async set(evaluationId: string, value: boolean): Promise<void> {
    const cfg = redisConfig();
    if (!cfg) {
      localAbortFlags.set(evaluationId, value);
      return;
    }
    try {
      const ttl = Number(
        process.env.AIGP_ABORT_REDIS_TTL_SECONDS ?? DEFAULT_TTL_SECONDS,
      );
      const key = `${KEY_PREFIX}${evaluationId}`;
      await redisCall(
        `/set/${encodeURIComponent(key)}/${value ? "1" : "0"}?EX=${ttl}`,
      );
    } catch (err) {
      warnRedisFallback("set", err);
      localAbortFlags.set(evaluationId, value);
    }
  },

  async get(evaluationId: string): Promise<boolean> {
    const cfg = redisConfig();
    if (!cfg) return localAbortFlags.get(evaluationId) === true;
    try {
      const key = `${KEY_PREFIX}${evaluationId}`;
      const r = await redisCall(`/get/${encodeURIComponent(key)}`);
      return (
        String(r?.result ?? "") === "1" ||
        String(r?.result ?? "").toLowerCase() === "true"
      );
    } catch (err) {
      warnRedisFallback("get", err);
      return localAbortFlags.get(evaluationId) === true;
    }
  },

  async delete(evaluationId: string): Promise<void> {
    const cfg = redisConfig();
    if (!cfg) {
      localAbortFlags.delete(evaluationId);
      return;
    }
    try {
      const key = `${KEY_PREFIX}${evaluationId}`;
      await redisCall(`/del/${encodeURIComponent(key)}`);
    } catch (err) {
      warnRedisFallback("delete", err);
      localAbortFlags.delete(evaluationId);
    }
  },
};
