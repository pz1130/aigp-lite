import { z } from "zod";
import type { ResponseFormat } from "./types";

// Keywords Anthropic structured outputs rejects. The zod schema still enforces
// them when the reply is validated, so dropping them only loosens the hint.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "default",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    // Recurse into sub-schemas only; `properties` keys are field names.
    out[key] =
      key === "properties"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [
              k,
              strip(v),
            ]),
          )
        : strip(value);
  }
  // Input-mode output leaves objects open; Anthropic requires them closed.
  if (out.type === "object" && !("additionalProperties" in out)) {
    out.additionalProperties = false;
  }
  return out;
}

/**
 * Build a provider-portable JSON schema from a zod schema. Uses the input
 * shape so fields with defaults stay optional for the model.
 */
export function jsonResponseFormat(
  name: string,
  schema: z.ZodType,
): ResponseFormat {
  return {
    name,
    schema: strip(z.toJSONSchema(schema, { io: "input" })) as Record<
      string,
      unknown
    >,
  };
}
