/**
 * Insert YAML macros the same way as JSON field editor:
 * replace the scalar under the cursor with ``"{{$…}}"``.
 */

import {
  resolveJsonStringReplaceRange,
} from "@/lib/jsonStringReplace";

/**
 * Find a YAML single-quoted scalar containing ``index`` (covers quotes).
 * Handles ``''`` escapes inside the scalar.
 */
export function findYamlSingleQuotedBounds(
  text: string,
  index: number,
): { start: number; end: number } | null {
  const n = text.length;
  const i = Math.max(0, Math.min(index, n));
  let pos = 0;
  while (pos < n) {
    if (text[pos] !== "'") {
      pos += 1;
      continue;
    }
    const start = pos;
    pos += 1;
    while (pos < n) {
      if (text[pos] !== "'") {
        pos += 1;
        continue;
      }
      // Escaped quote: ''
      if (pos + 1 < n && text[pos + 1] === "'") {
        pos += 2;
        continue;
      }
      const end = pos + 1;
      if (i >= start && i <= end) {
        return { start, end };
      }
      pos = end;
      break;
    }
    if (pos >= n && text[start] === "'") {
      if (i >= start) return { start, end: n };
    }
  }
  return null;
}

/** Plain (unquoted) scalar after ``key:`` on the same line as ``index``. */
export function findYamlPlainScalarAfterColon(
  text: string,
  index: number,
): { start: number; end: number } | null {
  const i = Math.max(0, Math.min(index, text.length));
  const lineStart = text.lastIndexOf("\n", i - 1) + 1;
  const nl = text.indexOf("\n", i);
  const lineEnd = nl < 0 ? text.length : nl;
  const line = text.slice(lineStart, lineEnd);
  const colon = line.indexOf(":");
  if (colon < 0) return null;

  let valueRel = colon + 1;
  while (
    valueRel < line.length &&
    (line[valueRel] === " " || line[valueRel] === "\t")
  ) {
    valueRel += 1;
  }

  if (valueRel < line.length) {
    const ch = line[valueRel];
    if (ch === "'" || ch === '"' || ch === "|" || ch === ">") return null;
    if (ch === "#" || ch === "{" || ch === "[") return null;
  }

  let endRel = line.length;
  const hash = line.indexOf(" #", valueRel);
  if (hash >= valueRel) endRel = hash;
  while (endRel > valueRel && /\s/.test(line[endRel - 1] ?? "")) {
    endRel -= 1;
  }

  // Only replace when cursor is on the value side of the colon.
  const absStart = lineStart + valueRel;
  const absEnd = lineStart + endRel;
  if (i < lineStart + colon) return null;
  return { start: absStart, end: absEnd };
}

export function resolveYamlScalarReplaceRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const a = Math.min(selectionStart, selectionEnd);
  const b = Math.max(selectionStart, selectionEnd);

  const doubleQuoted = resolveJsonStringReplaceRange(text, a, b);
  if (doubleQuoted) return doubleQuoted;

  const atA = findYamlSingleQuotedBounds(text, a);
  if (atA) return atA;
  if (b !== a) {
    const atB = findYamlSingleQuotedBounds(text, b);
    if (atB) return atB;
    const mid = findYamlSingleQuotedBounds(text, Math.floor((a + b) / 2));
    if (mid) return mid;
  }

  const plain = findYamlPlainScalarAfterColon(text, a);
  if (plain) return plain;
  if (b !== a) {
    const plainB = findYamlPlainScalarAfterColon(text, b);
    if (plainB) return plainB;
  }

  return null;
}

/**
 * Replace YAML scalar under cursor with a double-quoted macro token
 * (same form as JSON field editor: ``"{{$date.today()}}"``).
 */
export function insertOrReplaceYamlMacroValue(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  macro: string,
): { next: string; cursor: number; from: number; to: number; insert: string } {
  const quotedToken = JSON.stringify(macro);
  const range = resolveYamlScalarReplaceRange(
    text,
    selectionStart,
    selectionEnd,
  );
  if (range) {
    const next =
      text.slice(0, range.start) + quotedToken + text.slice(range.end);
    return {
      next,
      cursor: range.start + quotedToken.length,
      from: range.start,
      to: range.end,
      insert: quotedToken,
    };
  }
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const next = text.slice(0, start) + quotedToken + text.slice(end);
  return {
    next,
    cursor: start + quotedToken.length,
    from: start,
    to: end,
    insert: quotedToken,
  };
}
