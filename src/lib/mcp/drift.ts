import { createHash } from "node:crypto";

/** Canonical shape of one MCP tool for drift purposes — the injection surface. */
export interface McpToolDescriptor {
  name: string;
  description: string | null;
  inputSchema: unknown;
}

export interface ToolChange {
  name: string;
  descriptionChanged: boolean;
  inputSchemaChanged: boolean;
  before: McpToolDescriptor;
  after: McpToolDescriptor;
}

export interface SnapshotDiff {
  added: McpToolDescriptor[];
  removed: McpToolDescriptor[];
  changed: ToolChange[];
}

/** JSON.stringify with recursively sorted object keys — stable across key order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Canonicalize a raw tools/list payload: keep only name/description/inputSchema,
 * sort by name. Throws on anything that isn't an array of named tools.
 */
export function normalizeTools(raw: unknown): McpToolDescriptor[] {
  if (!Array.isArray(raw)) throw new Error("invalid tools payload");
  const tools = raw.map((t) => {
    if (t === null || typeof t !== "object")
      throw new Error("invalid tools payload");
    const o = t as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.length === 0) {
      throw new Error("invalid tools payload");
    }
    return {
      name: o.name,
      description: typeof o.description === "string" ? o.description : null,
      inputSchema: o.inputSchema ?? null,
    };
  });
  return tools.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** SHA-256 hex over the canonical serialization of a normalized tool list. */
export function hashTools(tools: McpToolDescriptor[]): string {
  return createHash("sha256").update(stableStringify(tools)).digest("hex");
}

/** Classify changes between two normalized tool lists. */
export function diffSnapshots(
  baseline: McpToolDescriptor[],
  current: McpToolDescriptor[],
): SnapshotDiff {
  const baseByName = new Map(baseline.map((t) => [t.name, t]));
  const currByName = new Map(current.map((t) => [t.name, t]));
  const added = current.filter((t) => !baseByName.has(t.name));
  const removed = baseline.filter((t) => !currByName.has(t.name));
  const changed: ToolChange[] = [];
  for (const before of baseline) {
    const after = currByName.get(before.name);
    if (!after) continue;
    const descriptionChanged = before.description !== after.description;
    const inputSchemaChanged =
      stableStringify(before.inputSchema) !==
      stableStringify(after.inputSchema);
    if (descriptionChanged || inputSchemaChanged) {
      changed.push({
        name: before.name,
        descriptionChanged,
        inputSchemaChanged,
        before,
        after,
      });
    }
  }
  return { added, removed, changed };
}
