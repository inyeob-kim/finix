import * as React from "react";
import { cn } from "./utils";

export function FinixField({
  label,
  helperText,
  className,
  children,
}: {
  label: string;
  helperText?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
      {helperText ? (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {helperText}
        </div>
      ) : null}
    </label>
  );
}

export const finixUnderlineControlClassName =
  "w-full bg-transparent border-0 border-b border-border px-0 py-2 text-sm outline-none focus:border-primary/60";

export const FinixUnderlineInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(finixUnderlineControlClassName, className)}
      {...props}
    />
  );
});
FinixUnderlineInput.displayName = "FinixUnderlineInput";

export const FinixUnderlineSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(finixUnderlineControlClassName, className)}
      {...props}
    />
  );
});
FinixUnderlineSelect.displayName = "FinixUnderlineSelect";

export const FinixUnderlineTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full bg-transparent border-0 border-b border-border px-0 py-2 text-sm outline-none focus:border-primary/60 resize-none",
        className,
      )}
      {...props}
    />
  );
});
FinixUnderlineTextarea.displayName = "FinixUnderlineTextarea";

