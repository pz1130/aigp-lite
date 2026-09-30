import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  getReport,
  UsageInsightsStateError,
} from "@/lib/usage-insights/service";
import { renderUsageInsightsPdf } from "@/lib/usage-insights/pdf";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  try {
    const { report, clusters } = await getReport(session.orgId, id);
    const buf = await renderUsageInsightsPdf(report, clusters);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(
          `usage-insights-v${report.version}.pdf`,
        ),
      },
    });
  } catch (err) {
    if (err instanceof UsageInsightsStateError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("[usage-insights pdf] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
