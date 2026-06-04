/** Collect dot paths for binding pickers (e.g. ``data.token``). */

export function collectDotPaths(
  value: unknown,
  prefix = "",
  maxDepth = 6,
  maxPaths = 40,
): string[] {
  const out: string[] = [];
  const walk = (cur: unknown, path: string, depth: number) => {
    if (out.length >= maxPaths || depth > maxDepth) return;
    if (cur === null || cur === undefined) {
      if (path) out.push(path);
      return;
    }
    if (Array.isArray(cur)) {
      if (path) out.push(path);
      cur.slice(0, 3).forEach((item, i) => {
        walk(item, path ? `${path}.${i}` : String(i), depth + 1);
      });
      return;
    }
    if (typeof cur === "object") {
      const keys = Object.keys(cur as Record<string, unknown>);
      if (keys.length === 0 && path) {
        out.push(path);
        return;
      }
      for (const k of keys) {
        const next = path ? `${path}.${k}` : k;
        walk((cur as Record<string, unknown>)[k], next, depth + 1);
      }
      return;
    }
    if (path) out.push(path);
  };
  walk(value, prefix, 0);
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

/** Read a dot path from a JSON object (for template preview hints). */
export function getByDotPath(root: unknown, dotPath: string): unknown {
  const parts = dotPath
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
      continue;
    }
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return cur;
}

/** Immutably set a dot path on a JSON object tree. */
export function setByDotPath(
  root: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): Record<string, unknown> {
  const parts = dotPath
    .replace(/^\$\.?/, "")
    .split(".")
    .filter(Boolean);
  if (parts.length === 0) return root;

  const clone = structuredClone(root);
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = cur[part];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value as never;
  return clone;
}
