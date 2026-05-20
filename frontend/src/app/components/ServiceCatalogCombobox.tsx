import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { FinixLoading } from "./ui/finix-loading";
import {
  filterServiceCatalogOptions,
  formatServiceCatalogLabel,
  type ServiceCatalogOption,
} from "@/lib/filterServiceCatalog";
import { FinixUnderlineInput } from "./ui/finix-form";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";
import { cn } from "./ui/utils";

type ServiceCatalogComboboxProps = {
  options: ServiceCatalogOption[];
  value: string;
  onValueChange: (code: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function ServiceCatalogCombobox({
  options,
  value,
  onValueChange,
  loading = false,
  disabled = false,
  placeholder = "서비스 코드 또는 이름 검색 (예: PY016)",
  className,
}: ServiceCatalogComboboxProps) {
  const selected = useMemo(
    () => options.find((o) => o.code === value) ?? null,
    [options, value],
  );

  const listRef = useRef<HTMLUListElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const matched = useMemo(
    () => filterServiceCatalogOptions(options, query),
    [options, query],
  );

  const showList = listOpen && matched.length > 0;

  useEffect(() => {
    if (!value) {
      setQuery("");
      setListOpen(false);
      setActiveIndex(0);
    }
  }, [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!showList) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showList]);

  const isSearching = listOpen || query.length > 0;
  const displayValue = isSearching
    ? query
    : selected
      ? formatServiceCatalogLabel(selected)
      : "";

  const pick = (option: ServiceCatalogOption) => {
    onValueChange(option.code);
    setQuery("");
    setListOpen(false);
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (matched.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setListOpen(true);
      setActiveIndex((i) => Math.min(matched.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setListOpen(true);
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      const picked = matched[activeIndex] ?? matched[0];
      if (picked) {
        e.preventDefault();
        e.stopPropagation();
        pick(picked);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
      setListOpen(false);
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-2", className)}>
        <FinixLoading size="sm" label="목록 불러오는 중…" inline />
      </div>
    );
  }

  return (
    <Popover
      open={showList}
      onOpenChange={(next) => {
        if (!next) setListOpen(false);
      }}
    >
      <PopoverAnchor asChild>
        <div className={cn("relative", className)} onKeyDownCapture={handleListKeyDown}>
          <FinixUnderlineInput
            value={displayValue}
            disabled={disabled || options.length === 0}
            placeholder={
              options.length === 0 ? "등록된 서비스 없음" : placeholder
            }
            className="pr-8"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => {
              if (!selected) return;
              if (!query) {
                setQuery(selected.code);
              }
              setListOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setQuery("");
                setListOpen(false);
              }, 150);
            }}
          />
          <ChevronsUpDown
            className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={cn(
          "z-[200] w-[min(36rem,calc(100vw-2rem))] p-0 overflow-hidden",
          "rounded-sm border border-border shadow-lg",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <ul
          ref={listRef}
          role="listbox"
          id="service-catalog-listbox"
          data-scroll-lock-scrollable=""
          className={cn(
            "max-h-[min(280px,50vh)] overflow-y-auto overscroll-contain py-1",
            "touch-pan-y",
            "[scrollbar-width:thin]",
          )}
          onWheel={(e) => e.stopPropagation()}
        >
          {matched.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                key={item.code}
                role="option"
                aria-selected={isActive}
                data-option-index={index}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm flex items-center gap-3 border-b border-border last:border-b-0",
                    isActive && "bg-[#5b8cff]/15 ring-1 ring-inset ring-[#5b8cff]/40",
                    !isActive && "hover:bg-muted/60",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(item)}
                >
                  <span className="font-mono text-xs shrink-0 w-[4.5rem]">
                    {item.code}
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
