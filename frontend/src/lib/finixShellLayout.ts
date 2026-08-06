/** Global app bar (institution / user) — aligns with sidebar logo row. */
export const SHELL_GLOBAL_HEADER_HEIGHT_CLASS = "h-10";

export const SHELL_GLOBAL_HEADER_ROW_CLASS = "flex items-center shrink-0";

/** Page title row below the global bar. */
export const SHELL_HEADER_HEIGHT_CLASS = "h-[3.25rem]";

export const SHELL_HEADER_ROW_CLASS = [
  "flex items-center shrink-0",
  SHELL_HEADER_HEIGHT_CLASS,
  "border-b border-border",
].join(" ");

/** Page header stays above scrolling main content. */
export const SHELL_HEADER_STICKY_CLASS = "shrink-0 z-30 bg-background";

/** Vertical stack for PageShell body sections (filters, table, footer). */
export const PAGE_SECTION_STACK_CLASS = "flex flex-col gap-5";

/** Pagination / footer row below a data table. */
export const TABLE_PAGINATION_FOOTER_CLASS =
  "pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-4";

/** Narrow dark icon rail width (Root). */
export const NAV_RAIL_WIDTH_CLASS = "w-14";
