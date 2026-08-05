/**
 * Find a JSON string literal that contains ``index`` (or touches selection).
 * Returns [start, end) covering the quotes, or null.
 */
export function findJsonStringBounds(
  text: string,
  index: number,
): { start: number; end: number } | null {
  const n = text.length;
  const i = Math.max(0, Math.min(index, n));

  // Scan all JSON strings; pick the one containing i (or nearest if on quote).
  let pos = 0;
  while (pos < n) {
    if (text[pos] !== '"') {
      pos += 1;
      continue;
    }
    const start = pos;
    pos += 1;
    let escaped = false;
    while (pos < n) {
      const ch = text[pos];
      if (escaped) {
        escaped = false;
        pos += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        pos += 1;
        continue;
      }
      if (ch === '"') {
        const end = pos + 1;
        if (i >= start && i <= end) {
          return { start, end };
        }
        pos = end;
        break;
      }
      pos += 1;
    }
    if (pos >= n && text[start] === '"') {
      // Unclosed string — treat rest as string if cursor is inside.
      if (i >= start) return { start, end: n };
    }
  }
  return null;
}

/** Expand selection to the enclosing JSON string if either endpoint is inside one. */
export function resolveJsonStringReplaceRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const a = Math.min(selectionStart, selectionEnd);
  const b = Math.max(selectionStart, selectionEnd);
  const atA = findJsonStringBounds(text, a);
  if (atA) return atA;
  if (b !== a) {
    const atB = findJsonStringBounds(text, b);
    if (atB) return atB;
    // Selection spans a value without being "inside" quotes (edge).
    const mid = findJsonStringBounds(text, Math.floor((a + b) / 2));
    if (mid) return mid;
  }
  return null;
}

/**
 * Replace the JSON/YAML double-quoted string under the cursor/selection with a
 * quoted token (e.g. ``"{{$date.today()}}"``). Falls back to insert at cursor.
 */
export function insertOrReplaceJsonStringValue(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  quotedToken: string,
): { next: string; cursor: number; from: number; to: number; insert: string } {
  const range = resolveJsonStringReplaceRange(
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
