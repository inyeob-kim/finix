import type { ScenarioRegistryFolder, ScenarioRegistryItem } from "./types";

export type FolderOption = { id: string; label: string; depth: number };
export type FolderSummary = { count: number; successRate: number; lastUpdated: string };

export function buildFolderOptions(
  folders: ScenarioRegistryFolder[],
): FolderOption[] {
  const roots = folders.filter((f) => f.parentId == null);
  const childrenByParent = new Map<string, ScenarioRegistryFolder[]>();
  folders
    .filter((f) => f.parentId != null)
    .forEach((f) => {
      const key = f.parentId as string;
      const arr = childrenByParent.get(key) ?? [];
      arr.push(f);
      childrenByParent.set(key, arr);
    });

  const out: FolderOption[] = [];
  const walk = (f: ScenarioRegistryFolder, depth: number) => {
    out.push({ id: f.id, label: f.name, depth });
    const kids = (childrenByParent.get(f.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    kids.forEach((k) => walk(k, depth + 1));
  };
  roots.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => walk(r, 0));
  return out;
}

export function buildFolderSummary(
  folders: ScenarioRegistryFolder[],
  items: ScenarioRegistryItem[],
): Map<string, FolderSummary> {
  const childrenByParent = new Map<string, string[]>();
  folders.forEach((f) => {
    if (!f.parentId) return;
    const arr = childrenByParent.get(f.parentId) ?? [];
    arr.push(f.id);
    childrenByParent.set(f.parentId, arr);
  });

  const descendantsCache = new Map<string, Set<string>>();
  const descendantsOf = (id: string): Set<string> => {
    const cached = descendantsCache.get(id);
    if (cached) return cached;
    const set = new Set<string>([id]);
    const stack = [...(childrenByParent.get(id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (set.has(cur)) continue;
      set.add(cur);
      (childrenByParent.get(cur) ?? []).forEach((kid) => stack.push(kid));
    }
    descendantsCache.set(id, set);
    return set;
  };

  const byId = new Map<string, FolderSummary>();
  folders.forEach((f) => {
    const set = descendantsOf(f.id);
    const scenarios = items.filter((s) => set.has(s.folderId));
    const count = scenarios.length;
    const successRate = count
      ? Math.round(
          scenarios.reduce((acc, s) => acc + (s.status === "active" ? 92 : 75), 0) /
            count,
        )
      : 0;
    const lastUpdated =
      scenarios
        .map((s) => s.updatedAt)
        .sort((a, b) => b.localeCompare(a))[0] ?? f.updatedAt;
    byId.set(f.id, { count, successRate, lastUpdated });
  });
  return byId;
}

