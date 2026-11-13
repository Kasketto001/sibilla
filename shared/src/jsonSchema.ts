import { z } from "zod";
import { SpecSchema } from "./spec";

const DROP = new Set(["$schema", "minItems", "maxItems", "minimum", "maximum", "minLength", "maxLength"]);

// Structured outputs accept a JSON schema subset: no oneOf, no tuples, no numeric/length constraints.
// What we drop here is still enforced by SpecSchema.parse on the response.
function normalize(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(normalize);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (DROP.has(k) || (k === "items" && "prefixItems" in s)) continue;
    if (k === "oneOf") out.anyOf = normalize(v);
    else if (k === "prefixItems") out.items = normalize((v as unknown[])[0]);
    else out[k] = normalize(v);
  }
  return out;
}

/** JSON schema sent to Claude as output format: inlined (no $ref), every object closed. */
export function specJsonSchema(): Record<string, unknown> {
  const s = normalize(z.toJSONSchema(SpecSchema, { reused: "inline", target: "draft-2020-12" })) as Record<string, unknown>;
  // Assigned by the server, never by the model. The model writes one screen at a time: the others are attached around it.
  for (const k of ["appId", "procedural", "screens"]) delete (s.properties as Record<string, unknown>)[k];
  return s;
}
