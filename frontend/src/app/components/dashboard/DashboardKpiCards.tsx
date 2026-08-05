import { motion, useReducedMotion } from "motion/react";
import type { DashboardKpi, DashboardKpiTone } from "@/lib/dashboardMetrics";
import { AnimatedNumber } from "./AnimatedNumber";
import { cn } from "../ui/utils";

const TONE_ACCENT: Record<DashboardKpiTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

const TONE_GLOW: Record<DashboardKpiTone, string> = {
  primary: "group-hover:border-primary/40",
  success: "group-hover:border-success/40",
  destructive: "group-hover:border-destructive/40",
  neutral: "group-hover:border-border",
};

const CARD_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5";

function KpiSkeleton() {
  return (
    <div className={CARD_GRID_CLASS}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-[86px] animate-pulse rounded-lg border border-border bg-muted/30"
        />
      ))}
    </div>
  );
}

export function DashboardKpiCards({
  items,
  loading,
}: {
  items: DashboardKpi[];
  loading?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (loading && items.length === 0) return <KpiSkeleton />;
  if (items.length === 0) return null;

  return (
    <div className={CARD_GRID_CLASS}>
      {items.map((kpi, index) => (
        <motion.div
          key={kpi.id}
          initial={
            prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.35,
            delay: prefersReducedMotion ? 0 : index * 0.06,
            ease: "easeOut",
          }}
          whileHover={prefersReducedMotion ? undefined : { y: -3 }}
          className={cn(
            "group relative overflow-hidden rounded-lg border border-border bg-card px-3.5 py-3 transition-colors",
            TONE_GLOW[kpi.tone],
          )}
        >
          <span
            className={cn(
              "absolute inset-x-0 top-0 h-0.5 opacity-70",
              TONE_ACCENT[kpi.tone],
            )}
          />
          <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-none tracking-tight">
            <AnimatedNumber value={kpi.value} display={kpi.display} />
          </p>
          <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
            {kpi.hint}
          </p>
          {kpi.ratio != null ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <motion.span
                className={cn("block h-full rounded-full", TONE_ACCENT[kpi.tone])}
                initial={prefersReducedMotion ? false : { width: 0 }}
                animate={{
                  width: `${Math.round(Math.min(1, Math.max(0, kpi.ratio)) * 100)}%`,
                }}
                transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
              />
            </div>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
