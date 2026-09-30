import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import {
  createRedteamAttestation,
  AttestationError,
} from "@/lib/redteam/attestation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!hasPermission(session.role, "redteam.write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  try {
    const res = await createRedteamAttestation({
      db: withOrg(prisma, session.orgId),
      orgId: session.orgId,
      userId: session.userId,
      file,
      fields: {
        usecaseId: str("usecaseId"),
        evaluationId: str("evaluationId"),
        attesterName: str("attesterName"),
        attesterOrg: str("attesterOrg"),
        attesterContact: str("attesterContact"),
        scope: str("scope"),
        methodology: str("methodology"),
        engagementStart: str("engagementStart"),
        engagementEnd: str("engagementEnd"),
        attestedAt: str("attestedAt"),
        summary: str("summary"),
      },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
    });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof AttestationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
