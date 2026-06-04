import type { ReactNode } from "react";
import { cn } from "../ui/utils";

type Props = {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Shared card shell for scenario wizard summary sections. */
export function ScenarioWizardSectionCard({
  title,
  hint,
  children,
  className,
  bodyClassName,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card shrink-0 flex flex-col min-h-0",
        className,
      )}
    >
      <div className="px-2.5 py-1.5 border-b border-border shrink-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        {hint ? (
          <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
        ) : null}
      </div>
      <div className={cn("px-2.5 py-2", bodyClassName)}>{children}</div>
    </div>
  );
}
