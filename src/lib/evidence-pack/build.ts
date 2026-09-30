import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { verifyChain } from "@/lib/audit/verify";
import { buildManifest, type FileInput } from "./manifest";
import type { ReportTemplateId } from "@/lib/reports/types";

export interface BuildInput {
  orgId: string;
  usecaseId?: string;
  framework?: string;
  userId: string;
}

export interface BuildResult {
  zip: Buffer;
  entries: string[];
  packHash: string;
  manifest: string;
}

// Fixed epoch so the same set of files always produces a byte-identical zip,
// making the pack hash reproducible and audit-friendly.
const DETERMINISTIC_DATE = new Date("2020-01-01T00:00:00Z");
const REPORT_TEMPLATE_IDS: readonly ReportTemplateId[] = [
  "nist-ai-rmf",
  "iso-27001",
  "soc2-type2",
  "iso-42001",
  "eu-ai-act",
  "mindforge",
];

function isReportTemplateId(value: string): value is ReportTemplateId {
  return REPORT_TEMPLATE_IDS.includes(value as ReportTemplateId);
}

export async function buildEvidencePack(
  input: BuildInput,
): Promise<BuildResult> {
  const files: FileInput[] = [];

  // 1. Cover PDF — use reports aggregator + template + PDF renderer
  const coverPdf = await generateCoverPdf(input);
  files.push({ path: "cover.pdf", content: coverPdf });

  // 2. Evidence artifacts for the use-case's controls
  const evidenceFiles = await collectEvidence(input);
  files.push(...evidenceFiles);

  // 3. FRIA/assessment snapshot
  const snapshot = await freezeSnapshot(input);
  files.push({
    path: "snapshot.json",
    content: Buffer.from(JSON.stringify(snapshot, null, 2)),
  });

  // 4. Audit chain verification
  const verification = await verifyChain({ orgId: input.orgId });
  files.push({
    path: "verification.json",
    content: Buffer.from(JSON.stringify(verification, null, 2)),
  });

  // 5. Build manifest (deterministic) — hashes every file above, then is itself
  //    added to the bundle so the auditor has the full integrity record.
  const manifest = buildManifest(files);
  const manifestJson = JSON.stringify(manifest, null, 2);
  files.push({ path: "manifest.json", content: Buffer.from(manifestJson) });

  // 6. Assemble the actual .zip bundle (deterministic order + timestamps).
  const zip = await assembleZip(files);

  return {
    zip,
    entries: files.map((f) => f.path),
    packHash: manifest.packHash,
    manifest: manifestJson,
  };
}

async function assembleZip(files: FileInput[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    zip.file(f.path, f.content, { date: DETERMINISTIC_DATE });
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function generateCoverPdf(input: BuildInput): Promise<Buffer> {
  try {
    const { getTemplate } = await import("@/lib/reports/registry");
    const { aggregate } = await import("@/lib/reports/aggregator");
    const { renderPdf } = await import("@/lib/reports/renderers/pdf");

    const templateId = input.framework ?? "nist-ai-rmf";
    if (!isReportTemplateId(templateId)) {
      throw new Error(`unknown report template: ${templateId}`);
    }
    const template = getTemplate(templateId);
    const now = new Date();
    const period = { start: new Date(now.getFullYear(), 0, 1), end: now };
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, name: true },
    });
    const data = await aggregate({
      orgId: input.orgId,
      period,
      template,
      generatedBy: { id: user.id, name: user.name ?? "" },
    });
    return await renderPdf(data);
  } catch {
    return Buffer.from("cover-pdf-placeholder");
  }
}

async function collectEvidence(input: BuildInput): Promise<FileInput[]> {
  const where: Record<string, unknown> = { orgId: input.orgId };
  if (input.usecaseId) where.usecaseId = input.usecaseId;

  const evidenceRows = await prisma.evidence.findMany({ where });
  const files: FileInput[] = [];

  for (const ev of evidenceRows) {
    try {
      const { retrieve } = await import("@/lib/storage");
      const content = await retrieve(ev.filePath);
      files.push({ path: `evidence/${ev.filename}`, content });
    } catch {
      files.push({
        path: `evidence/${ev.filename}`,
        content: Buffer.from("(missing)"),
      });
    }
  }

  return files;
}

async function freezeSnapshot(
  input: BuildInput,
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    orgId: input.orgId,
    usecaseId: input.usecaseId ?? null,
    frozenAt: new Date().toISOString(),
  };

  if (input.usecaseId) {
    const fria = await prisma.usecaseFria.findFirst({
      where: { orgId: input.orgId, usecaseId: input.usecaseId },
      orderBy: { version: "desc" },
    });
    if (fria) {
      snapshot.fria = {
        id: fria.id,
        title: fria.title,
        version: fria.version,
        status: fria.status,
        sectionsJson: fria.sectionsJson,
        updatedAt: fria.updatedAt.toISOString(),
      };
    }

    const controlStatuses = await prisma.usecaseControlStatus.findMany({
      where: { orgId: input.orgId, usecaseId: input.usecaseId },
    });
    snapshot.controlStatuses = controlStatuses.map((cs) => ({
      controlId: cs.controlId,
      status: cs.status,
    }));
  }

  return snapshot;
}
