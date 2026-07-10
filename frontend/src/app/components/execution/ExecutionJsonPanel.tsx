import { useMemo } from "react";
import {
  diffJsonPaths,
  pathIsHighlighted,
  pickJsonAtPaths,
} from "@/lib/executionJsonDiff";
import { prettyExecutionJson } from "@/lib/executionStepView";
import { cn } from "../ui/utils";

type Props = {
  label: string;
  value: unknown;
  compareWith?: unknown;
  changesOnly?: boolean;
  highlightPaths?: string[];
  tone?: "default" | "muted" | "success" | "danger";
  emptyMessage?: string;
};

function toneClass(tone: Props["tone"]): string {
  if (tone === "success") return "border-success/20 bg-success/5";
  if (tone === "danger") return "border-destructive/20 bg-destructive/5";
  if (tone === "muted") return "border-border bg-muted/20 text-muted-foreground";
  return "border-border bg-card";
}

function JsonTree({
  value,
  pathPrefix,
  highlights,
}: {
  value: unknown;
  pathPrefix: string;
  highlights: string[];
}) {
  if (value === null || typeof value !== "object") {
    return (
      <span className="text-foreground">{JSON.stringify(value)}</span>
    );
  }

  if (Array.isArray(value)) {
    return (
      <span>
        [
        {value.map((item, idx) => (
          <span key={idx}>
            {idx > 0 ? ", " : ""}
            <JsonTree
              value={item}
              pathPrefix={`${pathPrefix}[${idx}]`}
              highlights={highlights}
            />
          </span>
        ))}
        ]
      </span>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <span>
      {"{"}
      {entries.map(([key, val], idx) => {
        const path = pathPrefix ? `${pathPrefix}.${key}` : key;
        const highlighted = pathIsHighlighted(path, highlights);
        return (
          <div key={path} className="pl-3">
            {idx > 0 ? null : null}
            <span className="text-muted-foreground">{idx > 0 ? ", " : ""}</span>
            <span
              className={cn(
                highlighted &&
                  "text-amber-800 dark:text-amber-200 bg-amber-500/10 rounded px-0.5",
              )}
            >
              &quot;{key}&quot;
            </span>
            <span className="text-muted-foreground">: </span>
            <JsonTree value={val} pathPrefix={path} highlights={highlights} />
          </div>
        );
      })}
      {"}"}
    </span>
  );
}

export function ExecutionJsonPanel({
  label,
  value,
  compareWith,
  changesOnly = false,
  highlightPaths = [],
  tone = "default",
  emptyMessage = "차이 없음",
}: Props) {
  const diffPaths = useMemo(
    () => (compareWith !== undefined ? diffJsonPaths(compareWith, value) : []),
    [compareWith, value],
  );

  const displayValue = useMemo(() => {
    if (!changesOnly) return value;
    if (diffPaths.length === 0) return null;
    return pickJsonAtPaths(value, diffPaths);
  }, [changesOnly, diffPaths, value]);

  const highlights = useMemo(() => {
    if (changesOnly) return diffPaths;
    return [...new Set([...highlightPaths, ...diffPaths])];
  }, [changesOnly, diffPaths, highlightPaths]);

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {displayValue == null ? (
        <p className="text-[11px] text-muted-foreground italic px-1">{emptyMessage}</p>
      ) : (
        <pre
          className={cn(
            "rounded-sm border p-3 text-[11px] leading-relaxed overflow-x-auto max-h-64",
            toneClass(tone),
          )}
        >
          {highlights.length > 0 && !changesOnly ? (
            <code>
              <JsonTree
                value={displayValue}
                pathPrefix=""
                highlights={highlights}
              />
            </code>
          ) : (
            <code>{prettyExecutionJson(displayValue)}</code>
          )}
        </pre>
      )}
    </div>
  );
}
