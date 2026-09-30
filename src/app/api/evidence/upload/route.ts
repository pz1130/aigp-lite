import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { writeAudit } from "@/lib/audit/log";
import { store } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!hasPermission(session.role, "evidence.write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData)
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "missing file" }, { status: 400 });

  const usecaseId = (formData.get("usecaseId") as string) || undefined;
  const controlId = (formData.get("controlId") as string) || undefined;
  const notes = ((formData.get("notes") as string) ?? "").slice(0, 1000);

  let stored;
  try {
    stored = await store(session.orgId, file);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "storage error" },
      { status: 400 },
    );
  }

  const rec = await prisma.evidence.create({
    data: {
      orgId: session.orgId,
      usecaseId,
      controlId,
      filename: file.name,
      filePath: stored.path,
      mimeType: file.type,
      bytes: stored.bytes,
      sha256: stored.sha256,
      uploadedById: session.userId,
      notes,
    },
  });

  await writeAudit({
    orgId: session.orgId,
    actorId: session.userId,
    action: "evidence.upload",
    resourceType: "evidence",
    resourceId: rec.id,
    after: { filename: file.name, mimeType: file.type, bytes: stored.bytes },
    ip: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({ id: rec.id });
}
