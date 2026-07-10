import * as React from "react";
import { Link } from "react-router";
import { cn } from "./utils";

export function FinixPrimaryButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50",
        "h-9 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function FinixPrimaryLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50",
        "h-9 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors",
        className,
      )}
      {...props}
    />
  );
}
