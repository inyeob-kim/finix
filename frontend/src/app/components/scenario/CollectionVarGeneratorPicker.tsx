import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import type { CollectionVarGeneratorDto } from "@/api/collectionVarGeneratorApi";
import {
  LITERAL_GENERATOR_MODE,
  filterGeneratorPickerOptions,
  labelForGeneratorMode,
  loadRecentGeneratorKeys,
  pushRecentGeneratorKey,
  toGeneratorPickerOptions,
  type GeneratorPickerOption,
} from "@/lib/collectionVarGeneratorPicker";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { cn } from "../ui/utils";

type Props = {
  catalog: readonly CollectionVarGeneratorDto[];
  value: string;
  onValueChange: (mode: string) => void;
  loading?: boolean;
  disabled?: boolean;
};

function OptionRow({
  option,
  active,
  selected,
  onPick,
  index,
}: {
  option: GeneratorPickerOption;
  active: boolean;
  selected: boolean;
  onPick: () => void;
  index: number;
}) {
  return (
    <li role="option" aria-selected={selected} data-option-index={index}>
      <button
        type="button"
        className={cn(
          "w-full text-left px-2.5 py-1.5 rounded-sm",
          active ? "bg-muted" : "hover:bg-muted/60",
          selected ? "text-primary" : "text-foreground",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <span className="block text-xs font-medium truncate">{option.label}</span>
        <span className="block text-[10px] text-muted-foreground font-mono truncate">
          {option.key}
          {option.source === "shared" ? " · 공유" : ""}
          {option.hint ? ` · ${option.hint}` : ""}
        </span>
      </button>
    </li>
  );
}

export function CollectionVarGeneratorPicker({
  catalog,
  value,
  onValueChange,
  loading = false,
  disabled = false,
}: Props) {
  const options = useMemo(() => toGeneratorPickerOptions(catalog), [catalog]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>(() =>
    loadRecentGeneratorKeys(),
  );
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentKeys(loadRecentGeneratorKeys());
  }, [value, catalog]);

  const recentOptions = useMemo(() => {
    const byKey = new Map(options.map((o) => [o.key, o] as const));
    return recentKeys
      .map((k) => byKey.get(k))
      .filter((o): o is GeneratorPickerOption => o != null);
  }, [options, recentKeys]);

  const filtered = useMemo(
    () => filterGeneratorPickerOptions(options, query),
    [options, query],
  );

  const builtin = useMemo(
    () => filtered.filter((o) => o.source === "builtin"),
    [filtered],
  );
  const shared = useMemo(
    () => filtered.filter((o) => o.source === "shared"),
    [filtered],
  );

  const flatList = useMemo(() => {
    const rows: Array<{ kind: "literal" } | { kind: "option"; option: GeneratorPickerOption }> =
      [];
    const q = query.trim().toLowerCase();
    const literalMatches =
      !q ||
      "고정값".includes(q) ||
      "literal".includes(q) ||
      "고정".includes(q);
    if (literalMatches) rows.push({ kind: "literal" });
    for (const o of filtered) rows.push({ kind: "option", option: o });
    return rows;
  }, [filtered, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const pick = (mode: string) => {
    onValueChange(mode);
    if (mode !== LITERAL_GENERATOR_MODE) {
      setRecentKeys(pushRecentGeneratorKey(mode));
    }
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatList.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatList.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      const row = flatList[activeIndex] ?? flatList[0];
      if (!row) return;
      e.preventDefault();
      pick(row.kind === "literal" ? LITERAL_GENERATOR_MODE : row.option.key);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setOpen(false);
    }
  };

  const triggerLabel = loading
    ? "불러오는 중…"
    : labelForGeneratorMode(value, options);

  return (
    <div className="space-y-1.5">
      {recentOptions.length > 0 && !open ? (
        <div className="flex flex-wrap gap-1">
          {recentOptions.slice(0, 5).map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={disabled || loading}
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium",
                value === o.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
              title={o.hint ?? o.description ?? o.key}
              onClick={() => pick(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}

      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverAnchor asChild>
          <button
            type="button"
            disabled={disabled || loading}
            className={cn(
              "h-9 w-full rounded-sm border border-border bg-background px-2 text-xs",
              "inline-flex items-center justify-between gap-2 outline-none",
              "focus:ring-1 focus:ring-primary/30 disabled:opacity-50",
            )}
            onClick={() => setOpen(true)}
            aria-label="값 출처 선택"
          >
            <span className="truncate text-left">{triggerLabel}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              className="h-7 w-full bg-transparent text-xs outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="생성기 검색 (이름·key)"
              spellCheck={false}
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1 space-y-0.5"
          >
            {flatList.length === 0 ? (
              <li className="px-2.5 py-2 text-[11px] text-muted-foreground">
                검색 결과 없음
              </li>
            ) : null}
            {flatList.map((row, index) => {
              if (row.kind === "literal") {
                return (
                  <li
                    key="literal"
                    role="option"
                    aria-selected={value === LITERAL_GENERATOR_MODE}
                    data-option-index={index}
                  >
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-sm text-xs font-medium",
                        index === activeIndex ? "bg-muted" : "hover:bg-muted/60",
                        value === LITERAL_GENERATOR_MODE
                          ? "text-primary"
                          : "text-foreground",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(LITERAL_GENERATOR_MODE)}
                    >
                      고정값
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        실행마다 같은 문자열
                      </span>
                    </button>
                  </li>
                );
              }
              return (
                <OptionRow
                  key={`${row.option.source}-${row.option.key}`}
                  option={row.option}
                  index={index}
                  active={index === activeIndex}
                  selected={value === row.option.key}
                  onPick={() => pick(row.option.key)}
                />
              );
            })}
          </ul>
          {!query.trim() && (builtin.length > 0 || shared.length > 0) ? (
            <p className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground">
              내장 {builtin.length} · 공유 {shared.length}
              {recentOptions.length > 0
                ? ` · 최근 ${recentOptions.length}`
                : ""}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
