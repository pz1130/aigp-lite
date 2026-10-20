import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { prisma } from "@/lib/db";
import { parseExcel, parseMarkdown } from "@/lib/risk/import/parse";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set(["xlsx", "md", "txt"]);

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!hasPermission(session.role, "risk-catalog.write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData)
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "no file" }, { status: 400 });

  const frameworkId = formData.get("frameworkId");
  if (typeof frameworkId !== "string")
    return NextResponse.json(
      { error: "frameworkId required" },
      { status: 400 },
    );

  const fw = await prisma.riskFramework.findUnique({
    where: { id: frameworkId },
  });
  if (!fw)
    return NextResponse.json({ error: "framework not found" }, { status: 404 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "unsupported file type" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === "xlsx") {
      const controls = await parseExcel(buffer);
      return NextResponse.json({ controls });
    }

    const textContent = buffer.toString("utf-8");
    const controls = parseMarkdown(textContent);
    if (controls.length > 0) {
      return NextResponse.json({ controls });
    }

    return NextResponse.json(
      { error: "no structured controls found in file" },
      { status: 400 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
