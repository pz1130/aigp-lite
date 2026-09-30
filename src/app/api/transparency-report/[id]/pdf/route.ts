import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { withOrg } from "@/lib/db/orgIsolation";
import { resolveAggregation } from "@/lib/transparency-report/aggregate";
import {
  renderTxrPdf,
  type TxrReportWithIncludes,
} from "@/lib/transparency-report/pdf";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  const report = await prisma.txrReport.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      org: { select: { id: true, name: true } },
      usecase: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      publishedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!report)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const snapshot = await resolveAggregation(
      withOrg(prisma, session.orgId),
      report,
    );
    const buf = await renderTxrPdf(
      report as unknown as TxrReportWithIncludes,
      snapshot,
    );
    const scope = report.usecase
      ? report.usecase.name.replace(/\s+/g, "_")
      : "org";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(
          `transparency-report-${scope}-v${report.version}.pdf`,
        ),
      },
    });
  } catch (err) {
    console.error("[txr pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
