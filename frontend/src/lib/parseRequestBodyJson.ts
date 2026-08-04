/**
 * Parse scenario request-body JSON with light paste-friendly normalization.
 * Strict JSON.parse rejects common Postman / editor pastes (bare {{var}}, trailing commas, BOM).
 */

export type ParseBodyObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

const BARE_POSTMAN_VAR = /^\{\{\s*([A-Za-z_][\w]*)\s*\}\}$/;

/** True when braces/brackets look closed (ignore content inside strings). */
export function looksCompleteJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const start = trimmed[0];
  const end = trimmed[trimmed.length - 1];
  if (start === "{" && end !== "}") return false;
  if (start === "[" && end !== "]") return false;
  if (start !== "{" && start !== "[") return false;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString;
}

/**
 * Outside of JSON strings:
 * - quote bare Postman tokens: `: {{acctNo}}` → `: "{{acctNo}}"`
 * - drop trailing commas before `}` / `]`
 */
export function normalizeRequestBodyJsonText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return text;

  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    // Bare {{var}} → "{{var}}"
    if (ch === "{" && text[i + 1] === "{") {
      const close = text.indexOf("}}", i + 2);
      if (close !== -1) {
        const token = text.slice(i, close + 2);
        if (BARE_POSTMAN_VAR.test(token.trim())) {
          out += `"${token.trim()}"`;
          i = close + 2;
          continue;
        }
      }
    }

    // Trailing comma before } or ]
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j += 1;
      if (text[j] === "}" || text[j] === "]") {
        i = j;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function tryParseBodyObject(draft: string): ParseBodyObjectResult {
  const normalized = normalizeRequestBodyJsonText(draft);
  if (!normalized) {
    return { ok: false, error: "JSON 형식이 올바르지 않습니다." };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "최상위는 JSON 객체여야 합니다." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    const detail =
      err instanceof SyntaxError && err.message ? ` (${err.message})` : "";
    return {
      ok: false,
      error: `JSON 형식이 올바르지 않습니다.${detail}`,
    };
  }
}
