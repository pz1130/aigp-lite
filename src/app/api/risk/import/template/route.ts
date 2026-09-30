import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import {
  generateExcelTemplate,
  generateMarkdownTemplate,
} from "@/lib/risk/import/template";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!hasPermission(session.role, "risk.read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";

  if (format === "md") {
    const md = generateMarkdownTemplate();
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="controls-template.md"',
      },
    });
  }

  const buffer = await generateExcelTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="controls-template.xlsx"',
    },
  });
}
