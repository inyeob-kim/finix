import type { PoolServiceCoverageDto } from "@/api/dataPoolApi";

export function PoolCoverageTable({ items }: { items: PoolServiceCoverageDto[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-border overflow-auto max-h-40 shrink-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Service</th>
            <th className="px-3 py-2 font-medium">Total</th>
            <th className="px-3 py-2 font-medium">Happy</th>
            <th className="px-3 py-2 font-medium">Negative</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.service_code} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono text-xs">{row.service_code}</td>
              <td className="px-3 py-1.5 font-mono text-xs tabular-nums">{row.total}</td>
              <td className="px-3 py-1.5 font-mono text-xs tabular-nums">{row.happy}</td>
              <td className="px-3 py-1.5 font-mono text-xs tabular-nums">{row.negative}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
