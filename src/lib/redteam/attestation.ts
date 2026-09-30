import { z } from "zod";
import type { OrgScopedClient } from "@/lib/db/orgIsolation";
import { store } from "@/lib/storage";
import { writeAudit } from "@/lib/audit/log";

export class AttestationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AttestationError";
  }
}

const dateish = z
  .union([z.string(), z.date()])
  .nullish()
  .transform((v) => {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  });

const fieldsSchema = z.object({
  usecaseId: z.string().min(1),
  evaluationId: z.string().optional(),
  attesterName: z.string().min(1).max(200),
  attesterOrg: z.string().max(200).default(""),
  attesterContact: z.string().max(200).default(""),
  scope: z.string().min(1).max(5000),
  methodology: z.string().max(5000).default(""),
  engagementStart: dateish,
  engagementEnd: dateish,
  attestedAt: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v : new Date(v))),
  summary: z.string().max(5000).default(""),
});

export interface CreateAttestationFields {
  usecaseId: string;
  evaluationId?: string;
  attesterName: string;
  attesterOrg?: string;
  attesterContact?: string;
  scope: string;
  methodology?: string;
  engagementStart?: Date | null;
  engagementEnd?: Date | null;
  attestedAt: Date;
  summary?: string;
}

type FileInput = File | { buffer: Buffer; filename: string; mimeType: string };

// The shared `store()` helper accepts a broad allow-list of evidence MIME
// types (including text/plain), but a red-team attestation report must be a
// PDF — that's the artifact an external assessor actually delivers. Enforce
// that narrower rule here rather than in `store()`, which other evidence
// upload paths rely on staying permissive.
const ATTESTATION_MIME = "application/pdf";

export async function createRedteamAttestation(opts: {
  db: OrgScopedClient;
  orgId: string;
  userId: string;
  file: FileInput;
  fields: unknown;
  ip?: string;
}): Promise<{ id: string }> {
  const parsed = fieldsSchema.safeParse(opts.fields);
  if (!parsed.success) {
    throw new AttestationError(400, "invalid attestation fields");
  }
  const f = parsed.data;
  if (Number.isNaN(f.attestedAt.getTime())) {
    throw new AttestationError(400, "invalid attestedAt");
  }

  const mimeType =
    "mimeType" in opts.file ? opts.file.mimeType : opts.file.type;
  if (mimeType !== ATTESTATION_MIME) {
    throw new AttestationError(
      400,
      `attestation report must be a PDF (got "${mimeType}")`,
    );
  }

  const uc = await opts.db.aiUsecase.findFirst({
    where: { id: f.usecaseId, orgId: opts.orgId },
    select: { id: true },
  });
  if (!uc) throw new AttestationError(404, "usecase not found");

  if (f.evaluationId) {
    const ev = await opts.db.evaluation.findFirst({
      where: { id: f.evaluationId, orgId: opts.orgId, usecaseId: f.usecaseId },
      select: { id: true },
    });
    if (!ev) throw new AttestationError(400, "evaluation not in this system");
  }

  let stored: { path: string; sha256: string; bytes: number };
  try {
    stored = await store(opts.orgId, opts.file);
  } catch (err) {
    throw new AttestationError(
      400,
      err instanceof Error ? err.message : "storage error",
    );
  }

  const rec = await opts.db.redteamAttestation.create({
    data: {
      orgId: opts.orgId,
      usecaseId: f.usecaseId,
      evaluationId: f.evaluationId ?? null,
      attesterName: f.attesterName,
      attesterOrg: f.attesterOrg,
      attesterContact: f.attesterContact,
      scope: f.scope,
      methodology: f.methodology,
      engagementStart: f.engagementStart,
      engagementEnd: f.engagementEnd,
      attestedAt: f.attestedAt,
      summary: f.summary,
      storageKey: stored.path,
      reportSha256: stored.sha256,
      reportBytes: stored.bytes,
      createdBy: opts.userId,
    },
  });

  await writeAudit({
    orgId: opts.orgId,
    actorId: opts.userId,
    action: "redteam_attestation.created",
    resourceType: "redteam_attestation",
    resourceId: rec.id,
    after: {
      attesterName: f.attesterName,
      usecaseId: f.usecaseId,
      reportSha256: stored.sha256,
      reportBytes: stored.bytes,
    },
    ip: opts.ip,
  });

  return { id: rec.id };
}
