import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../ui/utils";

type DashboardPanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Reveal order for the staggered entrance. */
  index?: number;
  className?: string;
  bodyClassName?: string;
};

export function DashboardPanel({
  title,
  subtitle,
  action,
  children,
  index = 0,
  className,
  bodyClassName,
}: DashboardPanelProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: prefersReducedMotion ? 0 : 0.1 + index * 0.08,
        ease: "easeOut",
      }}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("min-h-0 min-w-0 flex-1", bodyClassName)}>
        {children}
      </div>
    </motion.section>
  );
}
