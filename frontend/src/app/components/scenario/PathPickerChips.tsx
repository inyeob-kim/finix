import { useMemo } from "react";
import { Check, Pencil } from "lucide-react";
import { collectDotPaths } from "@/lib/jsonDotPaths";
import { fieldVarNameFromPath, sortConnectedFirst } from "@/lib/scenarioConnectionUx";
import { cn } from "../ui/utils";

type Props = {
  label: string;
  data: Record<string, unknown> | null | undefined;
  onPick: (dotPath: string) => void;
  /** When set, connected chips call this instead of ``onPick`` (toggle disconnect). */
  onDisconnect?: (dotPath: string) => void;
  onPickPointerDown?: (dotPath: string) => void;
  emptyHint?: string;
  highlightPaths?: Set<string>;
  connectedPaths?: Set<string>;
  selectedPath?: string | null;
  /** When set, only render these paths (flow-first default). */
  pathsFilter?: string[];
  showPathTooltip?: boolean;
  /** Connected path → registered variable name (extract). */
  connectedVarByPath?: Record<string, string>;
  onRenameVar?: (path: string, currentVar: string) => void;
  /** Badge on active chips (default: 연결됨). */
  activeBadge?: string;
  /** Title when chip is active and can disconnect. */
  activeTitle?: string;
};

export function PathPickerChips({
  label,
  data,
  onPick,
  onDisconnect,
  onPickPointerDown,
  emptyHint,
  highlightPaths,
  connectedPaths,
  selectedPath,
  pathsFilter,
  showPathTooltip = false,
  connectedVarByPath,
  onRenameVar,
  activeBadge = "연결됨",
  activeTitle = "다시 클릭하면 연결 해제",
}: Props) {
  const allPaths = data ? collectDotPaths(data) : [];
  const pathCompare = (a: string, b: string) =>
    fieldVarNameFromPath(a).localeCompare(fieldVarNameFromPath(b));

  const paths = useMemo(() => {
    const raw = pathsFilter?.length
      ? allPaths.filter((p) => pathsFilter.includes(p))
      : allPaths;
    if (!connectedPaths?.size) return raw;
    return sortConnectedFirst(raw, (p) => connectedPaths.has(p), pathCompare);
  }, [allPaths, pathsFilter, connectedPaths]);

  const compatible = useMemo(() => {
    const list = paths.filter((p) => highlightPaths?.has(p));
    if (!connectedPaths?.size) return list;
    return sortConnectedFirst(list, (p) => connectedPaths.has(p), pathCompare);
  }, [paths, highlightPaths, connectedPaths]);

  const other = useMemo(() => {
    const list = paths.filter((p) => !highlightPaths?.has(p));
    if (!connectedPaths?.size) return list;
    return sortConnectedFirst(list, (p) => connectedPaths.has(p), pathCompare);
  }, [paths, highlightPaths, connectedPaths]);

  const keyCount = data ? Object.keys(data).length : 0;

  if (allPaths.length === 0) {
    const hint =
      emptyHint ??
      (keyCount > 0
        ? "필드를 펼칠 수 없습니다."
        : undefined);
    return hint ? (
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    ) : null;
  }

  if (paths.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        연결된 필드가 없습니다.
      </p>
    );
  }

  const renderChip = (p: string, emphasized: boolean) => {
    const isConnected = connectedPaths?.has(p);
    const isSelected = selectedPath === p;
    const varName = isConnected ? connectedVarByPath?.[p] : undefined;
    const chipLabel = varName ?? fieldVarNameFromPath(p);
    return (
      <span key={p} className="inline-flex items-center gap-0.5 max-w-full">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-mono transition-colors",
          isConnected && onDisconnect
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/25"
            : isSelected
              ? "border-primary bg-primary/20 text-primary font-semibold ring-1 ring-primary/30"
              : emphasized
                ? "border-primary/50 bg-primary/15 text-primary font-semibold hover:bg-primary/25"
                : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/10",
          highlightPaths && !emphasized && highlightPaths.size > 0
            ? "opacity-55"
            : "",
        )}
        onPointerDown={(e) => {
          e.preventDefault();
          onPickPointerDown?.(p);
        }}
        onClick={(e) => {
          e.preventDefault();
          if (isConnected && onDisconnect) onDisconnect(p);
          else onPick(p);
        }}
        title={
          isConnected && onDisconnect
            ? `${chipLabel} — ${activeTitle}`
            : showPathTooltip
              ? p
              : chipLabel
        }
      >
        {isConnected ? (
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
        ) : null}
        {chipLabel}
        {isConnected ? (
          <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-sans">
            {activeBadge}
          </span>
        ) : null}
      </button>
      {isConnected && onRenameVar && varName ? (
        <button
          type="button"
          className="p-0.5 rounded-sm text-muted-foreground hover:text-primary hover:bg-muted"
          aria-label="변수 이름 변경"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRenameVar(p, varName);
          }}
        >
          <Pencil className="w-3 h-3" />
        </button>
      ) : null}
      </span>
    );
  };

  return (
    <div className="space-y-1.5">
      {label ? (
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {highlightPaths && highlightPaths.size > 0 ? (
          <>
            {compatible.map((p) => renderChip(p, true))}
            {other.map((p) => renderChip(p, false))}
          </>
        ) : (
          paths.map((p) => renderChip(p, false))
        )}
      </div>
    </div>
  );
}
