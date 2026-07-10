import * as React from "react";
import { Link } from "react-router";
import {
  PAGE_ACTION_BUTTON_CLASS,
  PAGE_ACTION_BUTTON_PRIMARY_CLASS,
} from "@/lib/finixUiClasses";
import { cn } from "./utils";

type PageActionButtonProps = React.ComponentProps<"button"> & {
  variant?: "default" | "primary";
};

export function PageActionButton({
  className,
  variant = "default",
  type = "button",
  ...props
}: PageActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        PAGE_ACTION_BUTTON_CLASS,
        variant === "primary" && PAGE_ACTION_BUTTON_PRIMARY_CLASS,
        className,
      )}
      {...props}
    />
  );
}

type PageActionLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "default" | "primary";
};

export function PageActionLink({
  className,
  variant = "default",
  ...props
}: PageActionLinkProps) {
  return (
    <Link
      className={cn(
        PAGE_ACTION_BUTTON_CLASS,
        variant === "primary" && PAGE_ACTION_BUTTON_PRIMARY_CLASS,
        className,
      )}
      {...props}
    />
  );
}
