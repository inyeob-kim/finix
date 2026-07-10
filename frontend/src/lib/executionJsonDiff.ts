/** JSON path diff helpers for execution result panels. */

export function diffJsonPaths(a: unknown, b: unknown): string[] {
  const keys: string[] = [];
  const walk = (left: unknown, right: unknown, prefix: string) => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (
      typeof left !== "object" ||
      left === null ||
      typeof right !== "object" ||
      right === null
    ) {
      if (prefix) keys.push(prefix);
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (prefix) keys.push(prefix);
      return;
    }
    const lk = left as Record<string, unknown>;
    const rk = right as Record<string, unknown>;
    const names = new Set([...Object.keys(lk), ...Object.keys(rk)]);
    for (const name of names) {
      const p = prefix ? `${prefix}.${name}` : name;
      walk(lk[name], rk[name], p);
    }
  };
  walk(a, b, "");
  return keys.slice(0, 32);
}

export function getAtJsonPath(root: unknown, path: string): unknown {
  if (!path) return root;
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setAtJsonPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = cur[part];
    if (
      next == null ||
      typeof next !== "object" ||
      Array.isArray(next)
    ) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function pickJsonAtPaths(root: unknown, paths: string[]): unknown {
  if (paths.length === 0) {
    return root;
  }
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    const value = getAtJsonPath(root, path);
    if (value !== undefined) {
      setAtJsonPath(out, path, value);
    }
  }
  return out;
}

export function pathIsHighlighted(path: string, highlights: string[]): boolean {
  return highlights.some(
    (h) =>
      h === path ||
      h.startsWith(`${path}.`) ||
      path.startsWith(`${h}.`),
  );
}
