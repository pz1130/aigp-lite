import type {
  ProviderAdapter,
  AdapterStreamOpts,
  StreamChunk,
} from "./providers/types";

export interface ReliabilityOpts {
  timeoutMs: number;
  maxRetries: number;
}

export interface CircuitBreakerOpts {
  failureThreshold: number;
  cooldownMs: number;
}

export interface CircuitState {
  consecutiveFailures: number;
  openedUntil?: string;
  lastFailureAt?: string;
}

export interface RuntimeReliabilityConfig {
  fallbackConnectionId?: string;
  fallbackModel?: string;
  circuitBreaker: CircuitBreakerOpts;
  circuitState: CircuitState;
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerOpts = {
  failureThreshold: 3,
  cooldownMs: 5 * 60 * 1000,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

export function isRetryableRuntimeError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error);
  return /\b(5\d\d|429)\b/.test(msg) || msg.includes("timeout");
}

export function parseRuntimeReliabilityConfig(
  config: unknown,
): RuntimeReliabilityConfig {
  const root = asRecord(config);
  const breaker = asRecord(root.circuitBreaker);
  const state = asRecord(root.circuitState);
  const fallbackConnectionId =
    typeof root.fallbackConnectionId === "string" &&
    root.fallbackConnectionId.trim()
      ? root.fallbackConnectionId
      : undefined;
  const fallbackModel =
    typeof root.fallbackModel === "string" && root.fallbackModel.trim()
      ? root.fallbackModel
      : undefined;

  return {
    fallbackConnectionId,
    fallbackModel,
    circuitBreaker: {
      failureThreshold: asPositiveInt(
        breaker.failureThreshold,
        DEFAULT_CIRCUIT_BREAKER.failureThreshold,
      ),
      cooldownMs: asPositiveInt(
        breaker.cooldownMs,
        DEFAULT_CIRCUIT_BREAKER.cooldownMs,
      ),
    },
    circuitState: {
      consecutiveFailures: asPositiveInt(state.consecutiveFailures, 0),
      openedUntil:
        typeof state.openedUntil === "string" ? state.openedUntil : undefined,
      lastFailureAt:
        typeof state.lastFailureAt === "string"
          ? state.lastFailureAt
          : undefined,
    },
  };
}

export function isCircuitOpen(config: unknown, now = new Date()): boolean {
  const openedUntil =
    parseRuntimeReliabilityConfig(config).circuitState.openedUntil;
  return openedUntil ? new Date(openedUntil).getTime() > now.getTime() : false;
}

export function recordCircuitSuccess(config: unknown): Record<string, unknown> {
  const root = { ...asRecord(config) };
  delete root.circuitState;
  return root;
}

export function recordCircuitFailure(
  config: unknown,
  now = new Date(),
): { config: Record<string, unknown>; opened: boolean } {
  const root = { ...asRecord(config) };
  const parsed = parseRuntimeReliabilityConfig(root);
  const previousOpen = isCircuitOpen(root, now);
  const consecutiveFailures = parsed.circuitState.consecutiveFailures + 1;
  const nextState: CircuitState = {
    consecutiveFailures,
    lastFailureAt: now.toISOString(),
  };

  if (consecutiveFailures >= parsed.circuitBreaker.failureThreshold) {
    nextState.openedUntil = new Date(
      now.getTime() + parsed.circuitBreaker.cooldownMs,
    ).toISOString();
  }

  root.circuitState = nextState;
  return { config: root, opened: !previousOpen && !!nextState.openedUntil };
}

export function withReliability(
  adapter: ProviderAdapter,
  opts: ReliabilityOpts,
): ProviderAdapter {
  return {
    ping: adapter.ping,
    listModels: adapter.listModels,
    async *streamChat(input: AdapterStreamOpts): AsyncIterable<StreamChunk> {
      let attempt = 0;
      let firstChunkYielded = false;
      while (true) {
        const ctrl = new AbortController();
        const t = setTimeout(
          () => ctrl.abort(new Error("timeout")),
          opts.timeoutMs,
        );
        try {
          for await (const ch of adapter.streamChat({
            ...input,
            signal: ctrl.signal,
          })) {
            firstChunkYielded = firstChunkYielded || !!ch.delta;
            yield ch;
          }
          clearTimeout(t);
          return;
        } catch (e: unknown) {
          clearTimeout(t);
          if (
            firstChunkYielded ||
            !isRetryableRuntimeError(e) ||
            attempt >= opts.maxRetries
          )
            throw e;
          attempt++;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
      }
    },
  };
}
