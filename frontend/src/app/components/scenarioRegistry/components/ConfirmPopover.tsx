import type { ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";

export function ConfirmPopover({
  open,
  onOpenChange,
  anchor,
  title,
  description,
  cancelLabel = "취소",
  confirmLabel = "삭제",
  confirmClassName = "h-8 px-3 rounded-sm bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90",
  cancelClassName = "h-8 px-3 rounded-sm border border-border text-xs font-medium hover:bg-muted",
  onCancel,
  onConfirm,
  align = "end",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmClassName?: string;
  cancelClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="w-72 rounded-sm p-3"
        align={align}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium">{title}</div>
        {description != null ? (
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        ) : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className={cancelClassName}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

