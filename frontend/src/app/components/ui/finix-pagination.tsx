import type { ReactNode } from "react";
import { TABLE_PAGINATION_FOOTER_CLASS } from "@/lib/finixShellLayout";
import {
  PAGE_SIZE_SELECT_CLASS,
  PAGINATION_NAV_BUTTON_CLASS,
  PAGINATION_PAGE_ACTIVE_CLASS,
  PAGINATION_PAGE_INACTIVE_CLASS,
} from "@/lib/finixUiClasses";
import { cn } from "./utils";

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

type TablePaginationProps = {
  summary: ReactNode;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  totalPages: number;
  pagesToShow: number[];
  onPageChange: (page: number) => void;
  disabled?: boolean;
  pageSizeOptions?: readonly number[];
  controlsClassName?: string;
};

export function TablePagination({
  summary,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  pagesToShow,
  onPageChange,
  disabled = false,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  controlsClassName,
}: TablePaginationProps) {
  return (
    <div className={TABLE_PAGINATION_FOOTER_CLASS}>
      <div className="text-xs text-muted-foreground tabular-nums">{summary}</div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-4",
          controlsClassName,
        )}
      >
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>페이지 크기</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={PAGE_SIZE_SELECT_CLASS}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}개씩
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={PAGINATION_NAV_BUTTON_CLASS}
            disabled={disabled || currentPage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="첫 페이지"
          >
            «
          </button>
          <button
            type="button"
            className={PAGINATION_NAV_BUTTON_CLASS}
            disabled={disabled || currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {pagesToShow.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(p)}
              aria-current={currentPage === p ? "page" : undefined}
              className={
                currentPage === p
                  ? PAGINATION_PAGE_ACTIVE_CLASS
                  : PAGINATION_PAGE_INACTIVE_CLASS
              }
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className={PAGINATION_NAV_BUTTON_CLASS}
            disabled={disabled || currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            aria-label="다음 페이지"
          >
            ›
          </button>
          <button
            type="button"
            className={PAGINATION_NAV_BUTTON_CLASS}
            disabled={disabled || currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="마지막 페이지"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
