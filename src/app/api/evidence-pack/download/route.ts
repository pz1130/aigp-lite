import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { requireSession } from "@/lib/auth/session";
import { retrieve } from "@/lib/storage";
import { withAudit } from "@/middleware/audit";

export const runtime = "nodejs";

async function GETHandler(req: NextRequest): Promise<Response> {
  const sessionCtx = await requireSession();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return new Response("missing id", { status: 400 });

  const db = withOrg(prisma, sessionCtx.orgId);
  const pack = await db.evidencePack.findFirst({
    where: { id, orgId: sessionCtx.orgId },
  });
  if (!pack) return new Response("not found", { status: 404 });
  if (pack.status !== "ready" || !pack.storageKey) {
    return new Response("pack not ready", { status: 409 });
  }

  const buffer = await retrieve(pack.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="evidence-pack-${pack.id}.zip"`,
      "content-length": String(buffer.byteLength),
    },
  });
}

const getCtx = (req: NextRequest) => ({
  ip: req.headers.get("x-forwarded-for") ?? undefined,
});

export const GET = withAudit(GETHandler, getCtx);
