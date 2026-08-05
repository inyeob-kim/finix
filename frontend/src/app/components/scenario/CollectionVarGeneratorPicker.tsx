import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import type { CollectionVarGeneratorDto } from "@/api/collectionVarGeneratorApi";
import {
  LITERAL_GENERATOR_MODE,
  filterGeneratorPickerOptions,
  labelForGeneratorMode,
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
  /** popover = compact trigger; inline = always-visible search list. */
  variant?: "popover" | "inline";
  /** Include 「고정값」 row (scenario only). */
  includeLiteral?: boolean;
  className?: string;
  /** Override list scroll area (e.g. flex-1 min-h-0 for side panels). */
  listClassName?: string;
  /** Focus search input on mount / open. Default true. */
  autoFocusSearch?: boolean;
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
          "w-full text-left px-3 py-2 rounded-sm",
          active ? "bg-muted" : "hover:bg-muted/60",
          selected ? "text-primary" : "text-foreground",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <span className="block text-sm font-medium truncate">{option.label}</span>
        <span className="block text-[11px] text-muted-foreground font-mono truncate mt-0.5">
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
  variant = "popover",
  includeLiteral,
  className,
  listClassName,
  autoFocusSearch = true,
}: Props) {
  const showLiteral = includeLiteral ?? variant === "popover";
  const options = useMemo(() => toGeneratorPickerOptions(catalog), [catalog]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inline = variant === "inline";

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
    const rows: Array<
      { kind: "literal" } | { kind: "option"; option: GeneratorPickerOption }
    > = [];
    const q = query.trim().toLowerCase();
    const literalMatches =
      showLiteral &&
      (!q ||
        "고정값".includes(q) ||
        "literal".includes(q) ||
        "고정".includes(q));
    if (literalMatches) rows.push({ kind: "literal" });
    for (const o of filtered) rows.push({ kind: "option", option: o });
    return rows;
  }, [filtered, query, showLiteral]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, inline]);

  useEffect(() => {
    if (!open && !inline) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, inline]);

  useEffect(() => {
    if (!autoFocusSearch) return;
    if (inline) {
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, inline, autoFocusSearch]);

  const pick = (mode: string) => {
    onValueChange(mode);
    setQuery("");
    if (!inline) setOpen(false);
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
    if (e.key === "Escape" && !inline) {
      e.preventDefault();
      setQuery("");
      setOpen(false);
    }
  };

  const listBody = (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          className="h-8 w-full bg-transparent text-sm outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="생성기 검색 (이름·key)"
          spellCheck={false}
          disabled={disabled || loading}
        />
      </div>
      <ul
        ref={listRef}
        role="listbox"
        className={cn(
          "overflow-y-auto p-1.5 space-y-0.5",
          listClassName ?? (inline ? "max-h-80 min-h-[16rem]" : "max-h-64"),
        )}
      >
        {loading ? (
          <li className="px-3 py-2.5 text-xs text-muted-foreground">
            불러오는 중…
          </li>
        ) : flatList.length === 0 ? (
          <li className="px-3 py-2.5 text-xs text-muted-foreground">
            검색 결과 없음
          </li>
        ) : null}
        {!loading
          ? flatList.map((row, index) => {
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
                        "w-full text-left px-3 py-2 rounded-sm text-sm font-medium",
                        index === activeIndex ? "bg-muted" : "hover:bg-muted/60",
                        value === LITERAL_GENERATOR_MODE
                          ? "text-primary"
                          : "text-foreground",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(LITERAL_GENERATOR_MODE)}
                    >
                      고정값
                      <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
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
            })
          : null}
      </ul>
      {!query.trim() && (builtin.length > 0 || shared.length > 0) ? (
        <p className="shrink-0 border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
          내장 {builtin.length} · 공유 {shared.length}
        </p>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-background",
          className,
        )}
      >
        {listBody}
      </div>
    );
  }

  const triggerLabel = loading
    ? "불러오는 중…"
    : labelForGeneratorMode(value, options);

  return (
    <div>
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
          {listBody}
        </PopoverContent>
      </Popover>
    </div>
  );
}
