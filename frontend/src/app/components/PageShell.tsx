import type { ReactNode } from "react";
import { PageHeaderBar } from "./PageHeaderBar";
import { cn } from "./ui/utils";

type PageShellProps = {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
  /** Scroll container for page body (default: vertical scroll). */
  bodyClassName?: string;
};

export function PageShell({
  icon,
  title,
  description,
  actions,
  children,
  containerClassName,
  contentClassName,
  bodyClassName,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-h-0 h-full px-6 md:px-8 pb-6 md:pb-8 bg-background",
        containerClassName,
      )}
    >
      <div
        className={cn(
          "w-full mx-auto flex flex-col flex-1 min-h-0",
          contentClassName,
        )}
      >
        <PageHeaderBar
          icon={icon}
          title={title}
          description={description}
          actions={actions}
        />
        <div
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain pt-5",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
