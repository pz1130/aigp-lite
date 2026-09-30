import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { renderFriaPdf } from "@/lib/fria/pdf";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  const fria = await prisma.usecaseFria.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      org: { select: { id: true, name: true } },
      usecase: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!fria) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const buf = await renderFriaPdf(fria);
    const filename = `fria-${fria.usecase.name.replace(/\s+/g, "_")}-v${fria.version}.pdf`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(filename),
      },
    });
  } catch (err) {
    console.error("[fria pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
