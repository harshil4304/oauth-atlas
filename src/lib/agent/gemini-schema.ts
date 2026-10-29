/**
 * Gemini's structured output accepts a subset of JSON Schema. Convert what zod emits:
 *  - drop $schema, default, pattern and non-date formats (e.g. "uri")
 *  - turn anyOf [X, {type:"null"}] into X with a nullable type array
 */
type Json = Record<string, unknown>;

const KEEP_FORMATS = new Set(["date-time", "date", "time"]);

export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const n = { ...(node as Json) };
  delete n.$schema;
  delete n.default;
  delete n.pattern;
  if (typeof n.format === "string" && !KEEP_FORMATS.has(n.format)) delete n.format;

  if (Array.isArray(n.anyOf)) {
    const options = n.anyOf as Json[];
    const nonNull = options.filter((o) => o.type !== "null");
    if (nonNull.length === 1 && nonNull.length < options.length) {
      const inner = toGeminiSchema(nonNull[0]) as Json;
      delete n.anyOf;
      const t = inner.type;
      return { ...inner, ...n, type: Array.isArray(t) ? [...new Set([...t, "null"])] : [t, "null"] };
    }
  }

  for (const [k, v] of Object.entries(n)) {
    if (k === "properties" && v && typeof v === "object") {
      n[k] = Object.fromEntries(Object.entries(v as Json).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else if (typeof v === "object") {
      n[k] = toGeminiSchema(v);
    }
  }
  return n;
}
