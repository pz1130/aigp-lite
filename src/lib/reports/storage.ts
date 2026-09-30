import { store, retrieve } from "@/lib/storage";

export async function saveReportFile(
  orgId: string,
  reportId: string,
  templateId: string,
  format: "pdf" | "xlsx",
  buf: Buffer,
): Promise<string> {
  const mimeType =
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const filename = `${templateId}-${format}.${format === "pdf" ? "pdf" : "xlsx"}`;
  const { path } = await store(`${orgId}/reports/${reportId}`, {
    buffer: buf,
    filename,
    mimeType,
  });
  return path;
}

export async function readReportFile(key: string): Promise<Buffer> {
  return retrieve(key);
}
