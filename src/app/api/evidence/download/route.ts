import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { requireSession } from "@/lib/auth/session";
import { retrieve } from "@/lib/storage";
import { verify } from "@/lib/storage";
import { withAudit } from "@/middleware/audit";

export const runtime = "nodejs";

async function GETHandler(
  req: NextRequest,
  _ctx?: { orgId?: string; userId?: string },
): Promise<Response> {
  const sessionCtx = await requireSession();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return new Response("missing id", { status: 400 });

  const db = withOrg(prisma, sessionCtx.orgId);
  const rec = await db.evidence.findFirst({
    where: { id, orgId: sessionCtx.orgId },
  });
  if (!rec) return new Response("not found", { status: 404 });

  const valid = await verify(rec.filePath, rec.sha256);
  if (!valid) return new Response("file integrity error", { status: 500 });

  const buffer = await retrieve(rec.filePath);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": rec.mimeType,
      "content-disposition": `attachment; filename="${rec.filename}"`,
      "content-length": String(rec.bytes),
    },
  });
}

const getEvidenceCtx = (req: NextRequest) => ({
  ip: req.headers.get("x-forwarded-for") ?? undefined,
});

export const GET = withAudit(GETHandler, getEvidenceCtx);
