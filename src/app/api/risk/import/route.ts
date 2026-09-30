import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/check";
import { prisma } from "@/lib/db";
import { parseExcel, parseMarkdown } from "@/lib/risk/import/parse";
import { extractControlsFromText } from "@/lib/risk/import/ai-extract";

export const runtime = "nodejs";

const ALLOWED_EXT = new Set(["xlsx", "md", "txt", "pdf"]);

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!hasPermission(session.role, "risk.write")) {
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
  let textContent: string | null = null;

  try {
    // Excel: parse directly (structured data, no AI needed)
    if (ext === "xlsx") {
      const controls = await parseExcel(buffer);
      return NextResponse.json({ controls });
    }

    // Markdown / text: try table parsing first
    if (ext === "md" || ext === "txt") {
      textContent = buffer.toString("utf-8");
      const controls = parseMarkdown(textContent);
      if (controls.length > 0) {
        return NextResponse.json({ controls });
      }
    }

    // PDF: extract text
    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({
        data: new Uint8Array(buffer),
        verbosity: 0,
      });
      const result = await parser.getText();
      textContent = result.text;
    }

    // For MD/TXT that didn't parse as tables, use the text content
    if (!textContent && (ext === "md" || ext === "txt")) {
      textContent = buffer.toString("utf-8");
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json(
        { error: "could not extract text from file" },
        { status: 400 },
      );
    }

    // AI extraction for non-structured content
    const controls = await extractControlsFromText(
      session.orgId,
      textContent,
      fw.name,
    );
    return NextResponse.json({ controls });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
