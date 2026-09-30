import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key/manage";
import { runProxy } from "@/lib/runtime/proxy";
import { decryptJson } from "@/lib/crypto/secrets";
import { lookupPrice } from "@/lib/finops/prices";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/prisma";
import { logger } from "@/lib/observability/logger";
import { count, distribution } from "@/lib/observability/metrics";
import {
  findRelevantBudgets,
  tryFireAlert,
  secondsUntilPeriodEnd,
} from "@/lib/finops/budget";
import { periodToRange, getScopeTotal } from "@/lib/finops/cost";
import { webhookBus } from "@/lib/integrations/webhook-bus";
import { writeAudit } from "@/lib/audit/log";
import { policyEvents } from "@/lib/events/policy-bus";
import { loadRuntimePolicies } from "@/lib/policy/runtime-policies";
import { persistEvaluations } from "@/lib/policy-engine/persist";
import {
  isCircuitOpen,
  isRetryableRuntimeError,
  parseRuntimeReliabilityConfig,
  recordCircuitFailure,
  recordCircuitSuccess,
} from "@/lib/runtime/reliability";
import type { ProviderConnection } from "@/lib/prisma";

export const runtime = "nodejs";

interface CreateInvocationData {
  orgId: string;
  usecaseId?: string;
  apiKeyId?: string;
  connectionId?: string;
  provider: string;
  model: string;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  costUsd?: number;
  ts: Date;
}

interface RuntimeAttempt {
  connection: ProviderConnection;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  model: string;
  fallback: boolean;
}

function asConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function defaultModel(config: Record<string, unknown>): string | undefined {
  return typeof config.defaultModel === "string" && config.defaultModel.trim()
    ? config.defaultModel
    : undefined;
}

async function loadAttempt(
  connection: ProviderConnection,
  model: string,
  fallback: boolean,
): Promise<RuntimeAttempt> {
  const config = asConfig(connection.config);
  return {
    connection,
    credentials: decryptJson<Record<string, string>>(
      connection.credentialsEncrypted,
    ),
    config,
    model,
    fallback,
  };
}

async function recordAttemptSuccess(attempt: RuntimeAttempt) {
  const nextConfig = recordCircuitSuccess(attempt.config);
  if (nextConfig.circuitState === attempt.config.circuitState) return;
  await prisma.providerConnection.update({
    where: { id: attempt.connection.id },
    data: { config: nextConfig as Prisma.InputJsonValue },
  });
}

async function recordAttemptFailure(
  attempt: RuntimeAttempt,
  error: unknown,
  orgId: string,
) {
  if (!isRetryableRuntimeError(error)) return;
  const next = recordCircuitFailure(attempt.config);
  await prisma.providerConnection.update({
    where: { id: attempt.connection.id },
    data: { config: next.config as Prisma.InputJsonValue },
  });
  if (next.opened) {
    await writeAudit({
      orgId,
      actorId: undefined,
      action: "provider.connection.circuit_opened",
      resourceType: "provider_connection",
      resourceId: attempt.connection.id,
      after: { circuitState: next.config.circuitState },
    });
  }
}

async function resolveAttempts(
  primary: ProviderConnection,
  orgId: string,
  requestedModel: string,
): Promise<RuntimeAttempt[]> {
  const primaryConfig = asConfig(primary.config);
  const reliability = parseRuntimeReliabilityConfig(primaryConfig);
  const attempts: RuntimeAttempt[] = [];

  if (!isCircuitOpen(primaryConfig)) {
    attempts.push(await loadAttempt(primary, requestedModel, false));
  }

  if (reliability.fallbackConnectionId) {
    const fallback = await prisma.providerConnection.findFirst({
      where: { id: reliability.fallbackConnectionId, orgId, isActive: true },
    });
    if (fallback) {
      const fallbackConfig = asConfig(fallback.config);
      if (!isCircuitOpen(fallbackConfig)) {
        const fallbackModel =
          reliability.fallbackModel ??
          defaultModel(fallbackConfig) ??
          requestedModel;
        attempts.push(await loadAttempt(fallback, fallbackModel, true));
      }
    }
  }

  return attempts;
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const keyInfo = await verifyApiKey(apiKey);
  if (!keyInfo)
    return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  if (!keyInfo.scopes.includes("runtime.invoke"))
    return NextResponse.json(
      { error: "missing runtime.invoke scope" },
      { status: 403 },
    );

  const body = await request.json();
  const {
    connectionId,
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    topK,
    stop,
  } = body;

  if (!connectionId)
    return NextResponse.json(
      { error: "connectionId required" },
      { status: 400 },
    );

  const connection = await prisma.providerConnection.findFirst({
    where: { id: connectionId, orgId: keyInfo.orgId, isActive: true },
  });
  if (!connection)
    return NextResponse.json(
      { error: "connection not found" },
      { status: 404 },
    );

  const attempts = await resolveAttempts(connection, keyInfo.orgId, model);
  if (attempts.length === 0) {
    return NextResponse.json(
      { error: "connection unavailable" },
      { status: 503 },
    );
  }

  const promptHash = Buffer.from(JSON.stringify(messages))
    .toString("base64")
    .slice(0, 64);

  // Load active policies for this org (own + inherited from parent HQ, if any)
  // so runProxy can evaluate them.
  const activePolicies = await loadRuntimePolicies(keyInfo.orgId);

  const budgets = await findRelevantBudgets({
    orgId: keyInfo.orgId,
    apiKeyId: keyInfo.id,
    usecaseId: body.usecaseId ?? undefined,
  });
  for (const b of budgets) {
    const range = periodToRange(b.period, new Date());
    const spent = await getScopeTotal(
      b.scope as "org" | "api_key" | "usecase",
      b.scopeRefId ?? null,
      keyInfo.orgId,
      range,
    );
    const ratio = Number(b.amountUsd) > 0 ? spent / Number(b.amountUsd) : 0;

    if (ratio >= 0.8) {
      void tryFireAlert(b, 80, range, (ev) => {
        webhookBus.emit("budget.threshold.exceeded", ev);
        return Promise.resolve();
      });
    }
    if (ratio >= 1.0) {
      void tryFireAlert(b, 100, range, (ev) => {
        webhookBus.emit("budget.threshold.exceeded", ev);
        return Promise.resolve();
      });
      if (b.hardCap) {
        await writeAudit({
          orgId: keyInfo.orgId,
          actorId: undefined,
          action: "finops.budget.hardcap_blocked",
          resourceType: "budget",
          resourceId: b.id,
          after: { spent, amountUsd: Number(b.amountUsd) },
        });
        return NextResponse.json(
          { error: "budget exceeded", budgetId: b.id, scope: b.scope },
          {
            status: 429,
            headers: {
              "X-Budget-Exceeded": b.scope,
              "Retry-After": String(secondsUntilPeriodEnd(range)),
            },
          },
        );
      }
    }
  }

  const invocationMeta: {
    usage?: { input: number; output: number };
    latencyMs?: number;
    blocked?: boolean;
    attempt?: RuntimeAttempt;
    allHits?: ReturnType<typeof persistEvaluations> extends Promise<void>
      ? never
      : never;
  } = {};
  const startTime = Date.now();
  const allHits: Parameters<typeof persistEvaluations>[2] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      let emitted = false;
      let lastError: unknown;

      try {
        for (const attempt of attempts) {
          if (attempt.fallback) {
            send("warn", {
              code: "runtime.fallback_used",
              fromConnectionId: connection.id,
              toConnectionId: attempt.connection.id,
              model: attempt.model,
            });
          }

          try {
            for await (const ev of runProxy({
              connection: {
                providerType: attempt.connection.providerType,
                baseUrl: attempt.connection.baseUrl ?? "",
                credentials: attempt.credentials,
                config: attempt.config,
              },
              model: attempt.model,
              messages,
              temperature,
              maxTokens,
              topP,
              topK,
              stop,
              policies: activePolicies,
              evalCtxBase: { org: { id: keyInfo.orgId } },
            })) {
              if (ev.type === "chunk") {
                emitted = true;
                send("chunk", { text: ev.text });
              } else if (ev.type === "warn") {
                emitted = true;
                send("warn", ev.hit);
                if (ev.hit) allHits.push(ev.hit);
              } else if (ev.type === "blocked" && ev.hit) {
                emitted = true;
                send("blocked", ev.hit);
                allHits.push(ev.hit);
                policyEvents.emitBlocked({
                  orgId: keyInfo.orgId,
                  policyId: ev.hit.policyId,
                  policyName: ev.hit.policyName,
                  severity: ev.hit.severity,
                  snippet: ev.hit.snippet,
                  usecaseId: body.usecaseId ?? undefined,
                  blocked: true,
                });
              } else if (ev.type === "done") {
                invocationMeta.usage = ev.usage;
                invocationMeta.attempt = attempt;
                await recordAttemptSuccess(attempt);
                send("done", { usage: ev.usage });
              }
            }
            return;
          } catch (e) {
            lastError = e;
            await recordAttemptFailure(attempt, e, keyInfo.orgId);
            if (emitted || !isRetryableRuntimeError(e)) throw e;
          }
        }
        throw lastError ?? new Error("connection unavailable");
      } catch (e) {
        send("error", { message: String(e) });
      } finally {
        controller.close();

        const finalAttempt = invocationMeta.attempt;
        const latencyMs = Date.now() - startTime;

        // Emit failed-invocation metrics even when no attempt succeeded, so the gap is visible in dashboards
        if (!finalAttempt) {
          count("llm.invocation.failed");
          distribution("llm.invocation.latency", latencyMs, {
            model: "unknown",
          });
          return;
        }
        const usage = invocationMeta.usage;
        let costUsd: number | undefined;

        let pricing = finalAttempt.config.pricingOverride as
          { inputPerMillion: number; outputPerMillion: number } | undefined;
        if (!pricing) {
          const catalogPrice = lookupPrice(
            finalAttempt.connection.providerType,
            finalAttempt.model,
          );
          if (catalogPrice) {
            pricing = {
              inputPerMillion: catalogPrice.inputPerMillion,
              outputPerMillion: catalogPrice.outputPerMillion,
            };
          }
        }

        if (pricing) {
          const inputM = (usage?.input ?? 0) / 1_000_000;
          const outputM = (usage?.output ?? 0) / 1_000_000;
          costUsd =
            inputM * pricing.inputPerMillion +
            outputM * pricing.outputPerMillion;
        }

        logger.info({
          event: "llm_invocation",
          costUsd,
          latencyMs,
          model: finalAttempt.model,
          provider: finalAttempt.connection.providerType,
        });

        const invData: CreateInvocationData = {
          orgId: keyInfo.orgId,
          usecaseId: body.usecaseId ?? undefined,
          apiKeyId: keyInfo.id,
          connectionId: finalAttempt.connection.id,
          provider: finalAttempt.connection.providerType,
          model: finalAttempt.model,
          promptHash,
          inputTokens: usage?.input ?? 0,
          outputTokens: usage?.output ?? 0,
          latencyMs,
          costUsd,
          ts: new Date(),
        };

        prisma.llmInvocation.create({ data: invData }).catch((err) => {
          logger.error({
            event: "llm_invocation_save_failed",
            error: String(err),
          });
        });

        count("llm.invocation", { model: finalAttempt.model });
        distribution("llm.invocation.latency", latencyMs, {
          model: finalAttempt.model,
        });

        // Fire-and-forget: persist policy evaluation hits + trigger maybeOpenIncident
        if (allHits.length > 0) {
          void persistEvaluations(
            activePolicies.map((p) => ({ id: p.id, orgId: keyInfo.orgId })),
            { scope: "output" as const, text: "" },
            allHits,
            promptHash,
            body.usecaseId ?? null,
          ).catch((err) => {
            logger.error({
              event: "policy_evaluation_persist_failed",
              error: String(err),
            });
          });
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
