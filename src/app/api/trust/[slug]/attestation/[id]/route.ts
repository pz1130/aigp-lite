import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { retrieve } from "@/lib/storage";
import { getConfidentialView } from "@/lib/trust-center/public";
import {
  TRUST_COOKIE_NAME,
  verifyTrustCookie,
} from "@/lib/trust-center/cookie";
import { trustViewRateLimiter } from "@/lib/rate-limit/tokenBucket";

export const runtime = "nodejs";

const NOT_FOUND = () =>
  new Response("not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
): Promise<Response> {
  const { slug, id } = await ctx.params;

  const cookie = verifyTrustCookie(req.cookies.get(TRUST_COOKIE_NAME)?.value);
  if (!cookie || cookie.slug !== slug) return NOT_FOUND();

  if (
    !(
      await trustViewRateLimiter.consumeByKeyAsync(
        `trust-view:${cookie.tokenId}`,
      )
    ).allowed
  ) {
    return NOT_FOUND();
  }

  const view = await getConfidentialView({
    slug,
    tokenId: cookie.tokenId,
    ip: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  if (!view) return NOT_FOUND();

  // Authorization is snapshot membership, not org ownership: a withdrawn
  // version's attachments must stop downloading with it.
  const listed = view.confidentialPayload.attestations?.find(
    (a) => a.id === id,
  );
  if (!listed) return NOT_FOUND();

  const row = await prisma.redteamAttestation.findFirst({
    where: {
      id,
      orgId: (await prisma.trustProfile.findFirst({ where: { slug } }))!.orgId,
    },
  });
  if (!row) return NOT_FOUND();

  let buffer: Buffer;
  try {
    buffer = await retrieve(row.storageKey);
  } catch {
    return NOT_FOUND();
  }

  const actual = crypto.createHash("sha256").update(buffer).digest("hex");
  if (actual !== row.reportSha256) return NOT_FOUND();

  const attester =
    row.attesterName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "attester";
  const date = row.attestedAt.toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="redteam-attestation-${attester}-${date}.pdf"`,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
