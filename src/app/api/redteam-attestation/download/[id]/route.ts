import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { requireSession } from "@/lib/auth/session";
import { retrieve } from "@/lib/storage";
import { withAudit } from "@/middleware/audit";

export const runtime = "nodejs";

async function GETHandler(
  req: NextRequest,
  _ctx?: { orgId?: string; userId?: string },
): Promise<Response> {
  const session = await requireSession();
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop();
  if (!id) return new Response("missing id", { status: 400 });

  const db = withOrg(prisma, session.orgId);
  const row = await db.redteamAttestation.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!row) return new Response("not found", { status: 404 });

  const buffer = await retrieve(row.storageKey);
  const slug =
    row.attesterName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "attester";
  const date = row.attestedAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="redteam-attestation-${slug}-${date}.pdf"`,
      "content-length": String(buffer.byteLength),
    },
  });
}

const getCtx = (req: NextRequest) => ({
  ip: req.headers.get("x-forwarded-for") ?? undefined,
});

export const GET = withAudit(GETHandler, getCtx);
