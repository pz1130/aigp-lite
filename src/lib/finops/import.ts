import { lookupPrice } from "./prices";

export type ImportFormat = "azure" | "bailian";

export interface ImportRow {
  ts: Date;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  promptHash: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  format: ImportFormat | null;
}

/**
 * Detect CSV format from header row.
 */
export function detectFormat(header: string[]): ImportFormat | null {
  const h = header.map((c) => c.trim().toLowerCase());

  // Azure OpenAI: has "Time" and "Model Name"
  if (h.some((c) => c === "time") && h.some((c) => c === "model name")) {
    return "azure";
  }

  // Alibaba Bailian: has "时间" and "模型名称"
  if (h.some((c) => c === "时间") && h.some((c) => c === "模型名称")) {
    return "bailian";
  }

  return null;
}

/**
 * Parse CSV text into rows (handles quoted fields).
 */
function parseCsvRows(text: string): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field.trim());
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        current.push(field.trim());
        if (current.some((f) => f !== "")) lines.push(current);
        current = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some((f) => f !== "")) lines.push(current);
  }

  return lines;
}

/**
 * Map Azure OpenAI CSV row to ImportRow.
 */
function mapAzureRow(
  row: Record<string, string>,
): Omit<ImportRow, "promptHash"> | string {
  const ts = parseDate(row["Time"] || row["time"]);
  if (!ts) return "invalid date";

  const model = (row["Model Name"] || row["model name"] || "").trim();
  if (!model) return "missing model name";

  const inputTokens = parseInt(
    row["InputTokens"] || row["inputtokens"] || "0",
    10,
  );
  const outputTokens = parseInt(
    row["OutputTokens"] || row["outputtokens"] || "0",
    10,
  );
  if (isNaN(inputTokens) || isNaN(outputTokens)) return "invalid token count";

  // Cost in Azure export is typically in the account currency (USD)
  const costStr = row["Cost"] || row["cost"] || "";
  const costUsd = costStr ? parseFloat(costStr) : null;

  return {
    ts,
    provider: "azure_openai",
    model,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

/**
 * Map Alibaba Bailian CSV row to ImportRow.
 */
function mapBailianRow(
  row: Record<string, string>,
): Omit<ImportRow, "promptHash"> | string {
  const ts = parseDate(row["时间"] || row["时间戳"]);
  if (!ts) return "invalid date";

  const model = (row["模型名称"] || row["模型"] || "").trim();
  if (!model) return "missing model name";

  const inputTokens = parseInt(
    row["输入Token数"] || row["输入token数"] || "0",
    10,
  );
  const outputTokens = parseInt(
    row["输出Token数"] || row["输出token数"] || "0",
    10,
  );
  if (isNaN(inputTokens) || isNaN(outputTokens)) return "invalid token count";

  // Bailian cost is in CNY, need conversion (approximate: 1 USD ≈ 7.2 CNY)
  const costStr = row["费用"] || row["消费金额"] || "";
  const costCny = costStr ? parseFloat(costStr) : null;
  const costUsd = costCny != null ? costCny / 7.2 : null;

  return {
    ts,
    provider: "qwen_dashscope",
    model,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

/**
 * Parse date string (supports ISO 8601 and common Chinese date formats).
 */
function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Generate a unique hash for imported rows.
 */
function generateImportHash(): string {
  return (
    "import-" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}

/**
 * Parse CSV text and return structured import data.
 */
export function parseImportCsv(
  text: string,
  _orgId: string,
): {
  rows: ImportRow[];
  format: ImportFormat | null;
  errors: string[];
} {
  const lines = parseCsvRows(text);
  if (lines.length < 2) {
    return {
      rows: [],
      format: null,
      errors: ["CSV must have a header row and at least one data row"],
    };
  }

  const header = lines[0];
  const format = detectFormat(header);
  if (!format) {
    return {
      rows: [],
      format: null,
      errors: [
        "Unrecognized CSV format. Expected Azure OpenAI or Alibaba Bailian columns.",
      ],
    };
  }

  const rows: ImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const data = lines[i];
    if (data.length < header.length) {
      // Pad with empty strings
      while (data.length < header.length) data.push("");
    }

    const rowObj: Record<string, string> = {};
    header.forEach((h, idx) => {
      rowObj[h] = data[idx] ?? "";
    });

    const mapped =
      format === "azure" ? mapAzureRow(rowObj) : mapBailianRow(rowObj);
    if (typeof mapped === "string") {
      errors.push(`Row ${i + 1}: ${mapped}`);
      continue;
    }

    // Calculate cost if not provided in CSV
    let costUsd = mapped.costUsd;
    if (costUsd == null) {
      const price = lookupPrice(mapped.provider, mapped.model);
      if (price) {
        costUsd =
          (mapped.inputTokens / 1_000_000) * price.inputPerMillion +
          (mapped.outputTokens / 1_000_000) * price.outputPerMillion;
      }
    }

    rows.push({
      ...mapped,
      costUsd:
        costUsd != null ? Math.round(costUsd * 1_000_000) / 1_000_000 : null,
      promptHash: generateImportHash(),
    });
  }

  return { rows, format, errors };
}
