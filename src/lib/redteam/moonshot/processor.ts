import { mapMoonshotResults } from "./mapper";
import { runMoonshotBenchmark } from "./client";
import { getMoonshotConfig } from "./config";
import { decryptJson } from "@/lib/crypto/secrets";
import type { MoonshotRawResult } from "./mapper";
import type { PrismaClient } from "@/lib/prisma";

export interface ProcessDeps {
  db: Pick<
    PrismaClient,
    "evaluation" | "evaluationFinding" | "providerConnection"
  >;
  runEngine?: (model: string, recipes: string[]) => Promise<MoonshotRawResult>;
}

export async function processMoonshotRun(
  payload: { evaluationId: string },
  deps: ProcessDeps,
): Promise<void> {
  const { db } = deps;
  const ev = await db.evaluation.findFirstOrThrow({
    where: { id: payload.evaluationId },
  });
  await db.evaluation.update({
    where: { id: ev.id },
    data: { status: "running", engine: "moonshot", startedAt: new Date() },
  });

  try {
    const runEngine =
      deps.runEngine ??
      ((model: string, recipes: string[]) =>
        runMoonshotBenchmark(getMoonshotConfig(), {
          connectionId: ev.connectionId,
          model,
          recipes,
          resolveTarget: async (connectionId) => {
            const conn = await db.providerConnection.findUniqueOrThrow({
              where: { id: connectionId },
            });
            const creds = decryptJson<Record<string, string>>(
              conn.credentialsEncrypted,
            );
            return {
              conn: {
                id: conn.id,
                providerType: conn.providerType,
                baseUrl: conn.baseUrl,
                model,
              },
              creds: { apiKey: creds.apiKey ?? creds.api_key },
            };
          },
        }));
    const raw = await runEngine(ev.model, ev.promptSourceIds);
    const findings = mapMoonshotResults(raw);

    await db.evaluationFinding.createMany({
      data: findings.map((f) => ({ evaluationId: ev.id, ...f })),
    });
    const passed = findings.filter((f) => f.judgment === "pass").length;
    const failed = findings.filter((f) => f.judgment === "fail").length;
    const error = findings.filter((f) => f.judgment === "error").length;
    await db.evaluation.update({
      where: { id: ev.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        totalPrompts: findings.length,
        passedCount: passed,
        failedCount: failed,
        errorCount: error,
      },
    });
  } catch (e) {
    await db.evaluation.update({
      where: { id: ev.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }
}
