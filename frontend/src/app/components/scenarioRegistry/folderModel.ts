import type { ScenarioRegistryFolder, ScenarioRegistryItem } from "./types";

export type FolderOption = { id: string; label: string; depth: number };
export type FolderSummary = { count: number };

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

/** First collection in the same order as the UI tree (name-sorted). */
export function firstFolderIdInDisplayOrder(
  folders: ScenarioRegistryFolder[],
): string | null {
  return buildFolderOptions(folders)[0]?.id ?? null;
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
    const count = items.filter((s) => set.has(s.folderId)).length;
    byId.set(f.id, { count });
  });
  return byId;
}

