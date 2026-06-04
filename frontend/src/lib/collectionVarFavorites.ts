const STORAGE_KEY = "fcc.collection-var-favorites";

export type CollectionVarFavorite = {
  id: string;
  key: string;
  value: string;
};

export function loadCollectionVarFavorites(): CollectionVarFavorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CollectionVarFavorite[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) => typeof row.key === "string" && row.key.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function saveCollectionVarFavorites(items: CollectionVarFavorite[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function isFavoriteCollectionVarKey(
  favorites: CollectionVarFavorite[],
  key: string,
): boolean {
  const k = key.trim();
  return favorites.some((f) => f.key.trim() === k);
}

export function upsertCollectionVarFavorite(
  key: string,
  value: string,
): CollectionVarFavorite[] {
  const k = key.trim();
  if (!k) return loadCollectionVarFavorites();
  const prev = loadCollectionVarFavorites();
  const existing = prev.find((f) => f.key.trim() === k);
  const next: CollectionVarFavorite = existing
    ? { ...existing, key: k, value }
    : { id: crypto.randomUUID(), key: k, value };
  const merged = [next, ...prev.filter((f) => f.key.trim() !== k)];
  saveCollectionVarFavorites(merged);
  return merged;
}

export function removeCollectionVarFavorite(id: string): CollectionVarFavorite[] {
  const next = loadCollectionVarFavorites().filter((f) => f.id !== id);
  saveCollectionVarFavorites(next);
  return next;
}
