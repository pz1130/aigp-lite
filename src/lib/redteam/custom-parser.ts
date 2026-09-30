import {
  CATEGORIES,
  SEVERITIES,
  CHECKER_SLUGS,
  type Category,
  type Severity,
  type CheckerSlug,
} from "./types";

export interface ParsedPrompt {
  promptId: string;
  category: Category;
  severity: Severity;
  text: string;
  checker: CheckerSlug;
  expectedBehavior: string;
}

export interface ParseOutput {
  prompts: ParsedPrompt[];
  errors: string[];
}

const REQUIRED = [
  "promptId",
  "category",
  "severity",
  "text",
  "checker",
] as const;

function validateRow(
  row: Record<string, unknown>,
  line: number,
): { ok: ParsedPrompt | null; err: string | null } {
  for (const k of REQUIRED) {
    if (!row[k] || typeof row[k] !== "string") {
      return {
        ok: null,
        err: `line ${line}: missing or non-string field ${k}`,
      };
    }
  }
  if (!CATEGORIES.includes(row.category as Category)) {
    return { ok: null, err: `line ${line}: invalid category ${row.category}` };
  }
  if (!SEVERITIES.includes(row.severity as Severity)) {
    return { ok: null, err: `line ${line}: invalid severity ${row.severity}` };
  }
  if (!CHECKER_SLUGS.includes(row.checker as CheckerSlug)) {
    return { ok: null, err: `line ${line}: invalid checker ${row.checker}` };
  }
  return {
    ok: {
      promptId: row.promptId as string,
      category: row.category as Category,
      severity: row.severity as Severity,
      text: row.text as string,
      checker: row.checker as CheckerSlug,
      expectedBehavior: (row.expectedBehavior as string) ?? "",
    },
    err: null,
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inq = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inq && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inq = !inq;
      }
    } else if (c === "," && !inq) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const vals = parseCsvLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}

export function parseCustomPrompts(
  text: string,
  format: "csv" | "jsonl",
): ParseOutput {
  const prompts: ParsedPrompt[] = [];
  const errors: string[] = [];

  if (format === "jsonl") {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 0; i < lines.length; i++) {
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(lines[i]);
      } catch {
        errors.push(`line ${i + 1}: invalid JSON`);
        continue;
      }
      const r = validateRow(row, i + 1);
      if (r.err) errors.push(r.err);
      if (r.ok) prompts.push(r.ok);
    }
  } else {
    const rows = parseCsv(text);
    rows.forEach((row, i) => {
      const r = validateRow(row, i + 2);
      if (r.err) errors.push(r.err);
      if (r.ok) prompts.push(r.ok);
    });
  }

  return { prompts, errors };
}
