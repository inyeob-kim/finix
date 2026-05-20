export type ServiceCatalogOption = {
  code: string;
  name: string;
};

export function filterServiceCatalogOptions(
  options: ServiceCatalogOption[],
  query: string,
  limit = 50,
): ServiceCatalogOption[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return options.slice(0, limit);
  }
  return options
    .filter(
      (s) =>
        s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function formatServiceCatalogLabel(option: ServiceCatalogOption): string {
  return `${option.code} — ${option.name}`;
}
