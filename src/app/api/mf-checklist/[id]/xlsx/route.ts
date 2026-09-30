import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getCatalog } from "@/lib/mf-checklist/catalog";
import { renderMfChecklistXlsx } from "@/lib/mf-checklist/xlsx";
import type { MfChecklistWithIncludes } from "@/lib/mf-checklist/pdf";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  const a = await prisma.mfChecklistAssessment.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      org: { select: { id: true, name: true } },
      usecase: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      answers: {
        select: {
          itemCode: true,
          status: true,
          elaboration: true,
          evidenceRefs: true,
        },
      },
    },
  });
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const catalog = await getCatalog();
    const buf = await renderMfChecklistXlsx(
      a as unknown as MfChecklistWithIncludes,
      catalog,
    );
    const scope = a.usecase ? a.usecase.name.replace(/\s+/g, "_") : "org";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": attachmentDisposition(
          `mf-checklist-${scope}-v${a.version}.xlsx`,
        ),
      },
    });
  } catch (err) {
    console.error("[mf-checklist xlsx] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
