import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  getReport,
  IncidentTrendsStateError,
} from "@/lib/incident-trends/service";
import { renderTrendsXlsx } from "@/lib/incident-trends/xlsx";
import { attachmentDisposition } from "@/lib/http/content-disposition";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();
  try {
    const { report, clusters } = await getReport(session.orgId, id);
    const buf = await renderTrendsXlsx(report, clusters);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": attachmentDisposition(
          `incident-trends-v${report.version}.xlsx`,
        ),
      },
    });
  } catch (err) {
    if (err instanceof IncidentTrendsStateError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("[itr xlsx] render failed", err);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}
