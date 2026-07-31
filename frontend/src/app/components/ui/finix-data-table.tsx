import type { ComponentProps } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { cn } from "./utils";

/** Bordered scroll frame — no shadow. */
export const FINIX_DATA_TABLE_FRAME_CLASS =
  "bg-card border border-border rounded-sm overflow-auto min-h-0";

/** Page body: remaining height, table hugs content until max. */
export const FINIX_DATA_TABLE_STACK_CLASS =
  "flex-1 min-h-0 flex flex-col overflow-hidden min-w-0";

export const FINIX_DATA_TABLE_HUG_CLASS =
  "flex h-max max-h-full min-h-0 w-full flex-col overflow-hidden";

export const FINIX_DATA_TABLE_STICKY_HEADER_CLASS =
  "sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-[inset_0_-1px_0_0_hsl(var(--border))]";

export const FINIX_DATA_TABLE_HEAD_CLASS =
  "text-xs font-semibold text-muted-foreground h-8 py-1.5";

export const FINIX_DATA_TABLE_ROW_CLASS =
  "border-b border-border hover:bg-muted/40 transition-colors";

export const FINIX_DATA_TABLE_CELL_CLASS = "py-1.5";

export const FINIX_DATA_TABLE_ICON_BTN_CLASS =
  "inline-flex items-center justify-center h-7 w-7 rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none";

export const FINIX_DATA_TABLE_GHOST_BTN_CLASS =
  "inline-flex items-center justify-center h-7 w-7 p-0 rounded-sm border border-transparent text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none";

type FrameProps = ComponentProps<"div">;

/** Scrollable bordered shell around a FinixDataTable. */
export function FinixDataTableFrame({ className, ...props }: FrameProps) {
  return (
    <div
      data-slot="finix-data-table-frame"
      className={cn(FINIX_DATA_TABLE_FRAME_CLASS, "shrink", className)}
      {...props}
    />
  );
}

/** Plain table element (no extra overflow wrapper — sticky header friendly). */
export function FinixDataTable({
  className,
  ...props
}: ComponentProps<"table">) {
  return (
    <table
      data-slot="finix-data-table"
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  );
}

export function FinixDataTableHeader({
  className,
  sticky = true,
  ...props
}: ComponentProps<typeof TableHeader> & { sticky?: boolean }) {
  return (
    <TableHeader
      className={cn(
        sticky && FINIX_DATA_TABLE_STICKY_HEADER_CLASS,
        className,
      )}
      {...props}
    />
  );
}

export function FinixDataTableHead({
  className,
  ...props
}: ComponentProps<typeof TableHead>) {
  return (
    <TableHead className={cn(FINIX_DATA_TABLE_HEAD_CLASS, className)} {...props} />
  );
}

export function FinixDataTableBody(props: ComponentProps<typeof TableBody>) {
  return <TableBody {...props} />;
}

export function FinixDataTableRow({
  className,
  interactive = false,
  ...props
}: ComponentProps<typeof TableRow> & { interactive?: boolean }) {
  return (
    <TableRow
      className={cn(
        FINIX_DATA_TABLE_ROW_CLASS,
        interactive && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function FinixDataTableCell({
  className,
  ...props
}: ComponentProps<typeof TableCell>) {
  return (
    <TableCell className={cn(FINIX_DATA_TABLE_CELL_CLASS, className)} {...props} />
  );
}
