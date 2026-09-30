import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/rbac/check";
import { withOrg } from "@/lib/db/orgIsolation";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/log";
import { parseImportCsv, type ImportResult } from "@/lib/finops/import";

export async function POST(req: Request) {
  const ctx = await requireSession();
  assertPermission(ctx.role, "finops.write");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const { rows, format, errors: parseErrors } = parseImportCsv(text, ctx.orgId);

  if (!format) {
    return NextResponse.json({
      total: 0,
      imported: 0,
      skipped: 0,
      errors: parseErrors,
      format: null,
    } satisfies ImportResult);
  }

  const db = withOrg(prisma, ctx.orgId);
  let imported = 0;
  const errors: string[] = [...parseErrors];

  // Batch insert in chunks of 100
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await db.llmInvocation.createMany({
        data: batch.map((row) => ({
          orgId: ctx.orgId,
          provider: row.provider,
          model: row.model,
          promptHash: row.promptHash,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          costUsd: row.costUsd ?? undefined,
          ts: row.ts,
        })),
      });
      imported += batch.length;
    } catch (err) {
      errors.push(
        `Batch ${Math.floor(i / batchSize) + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Write audit log
  await writeAudit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "finops.import",
    resourceType: "llm_invocation",
    after: {
      format,
      totalRows: rows.length,
      imported,
      skipped: rows.length - imported,
      fileName: file.name,
    },
  });

  const result: ImportResult = {
    total: rows.length,
    imported,
    skipped: rows.length - imported,
    errors,
    format,
  };

  return NextResponse.json(result);
}
