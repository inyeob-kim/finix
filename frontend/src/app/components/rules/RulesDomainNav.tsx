import {
  domainLabel,
  type RulesDomainNavNode,
  type RulesDomainSelection,
} from "@/lib/cbsServiceTaxonomy";
import { cn } from "../ui/utils";

function DomainNavLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <span className="flex items-baseline gap-1.5 min-w-0">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
        · {count}
      </span>
    </span>
  );
}

export function RulesDomainNav({
  nodes,
  selection,
  onSelect,
}: {
  nodes: RulesDomainNavNode[];
  selection: RulesDomainSelection;
  onSelect: (next: RulesDomainSelection) => void;
}) {
  const allSelected = selection.type === "all";
  const empty = nodes.length === 0;
  const totalCount = nodes.reduce((sum, node) => sum + node.count, 0);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="h-11 px-4 border-b border-border shrink-0 flex items-center">
        <div className="text-sm font-medium">업무 도메인</div>
      </div>
      <div className="p-2 overflow-auto flex-1 min-h-0 space-y-0.5">
        <button
          type="button"
          className={cn(
            "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors",
            allSelected
              ? "bg-muted text-foreground"
              : "hover:bg-muted/70 text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onSelect({ type: "all" })}
        >
          <DomainNavLabel label="전체" count={totalCount} />
        </button>

        {empty ? (
          <p className="text-sm text-muted-foreground p-3">
            표시할 도메인이 없습니다.
          </p>
        ) : (
          nodes.map((node) => {
            const selected =
              selection.type === "domain" &&
              selection.domain === node.domain;
            const label = domainLabel(node.domain);
            return (
              <button
                key={node.domain}
                type="button"
                className={cn(
                  "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors",
                  selected
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  onSelect({ type: "domain", domain: node.domain });
                }}
                title={`${label} · ${node.count}`}
              >
                <DomainNavLabel label={label} count={node.count} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
