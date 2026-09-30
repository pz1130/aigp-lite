import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getCatalog } from "@/lib/aivtf/catalog";
import { renderAivtfPdf, type AivtfWithIncludes } from "@/lib/aivtf/pdf";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  const a = await prisma.aivtfAssessment.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      org: { select: { id: true, name: true } },
      usecase: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      answers: {
        select: { processCode: true, status: true, elaboration: true },
      },
    },
  });
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const catalog = await getCatalog();
    const buf = await renderAivtfPdf(
      a as unknown as AivtfWithIncludes,
      catalog,
    );
    const scope = a.usecase ? a.usecase.name.replace(/\s+/g, "_") : "org";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(
          `aivtf-${scope}-v${a.version}.pdf`,
        ),
      },
    });
  } catch (err) {
    console.error("[aivtf pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
