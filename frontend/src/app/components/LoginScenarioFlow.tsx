import { useEffect, useState } from "react";
import { cn } from "./ui/utils";

const STEPS = [
  { id: "start", label: "Start", kind: "pill" as const },
  { id: "tc1", label: "TC01", kind: "step" as const, title: "조회" },
  { id: "tc2", label: "TC02", kind: "step" as const, title: "이체" },
  { id: "end", label: "End", kind: "pill" as const },
];

type LoginScenarioFlowProps = {
  className?: string;
  /** Header strip — smaller nodes, no caption. */
  compact?: boolean;
};

/**
 * Login hero motion: Start → cases → End with a traveling data pulse.
 * Mirrors in-app scenario flow language without video assets.
 */
export function LoginScenarioFlow({
  className,
  compact = false,
}: LoginScenarioFlowProps) {
  const [pulseAt, setPulseAt] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPulseAt((n) => (n + 1) % (STEPS.length - 1));
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "relative select-none",
        compact ? "w-auto max-w-none" : "w-full max-w-xl",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "flex items-center gap-0",
          compact ? "justify-start" : "justify-center",
        )}
      >
        {STEPS.map((step, idx) => {
          const isActive = pulseAt === idx || pulseAt === idx - 1;
          const showPulseOnLink = pulseAt === idx;
          return (
            <div key={step.id} className="flex items-center">
              {step.kind === "pill" ? (
                <div
                  className={cn(
                    "rounded-md font-semibold tracking-wide text-white transition-all duration-500 bg-slate-500",
                    compact
                      ? "px-2 py-0.5 text-[9px]"
                      : "px-3 py-1.5 text-[11px]",
                    isActive && "ring-2 ring-teal-400/50 scale-[1.03]",
                  )}
                >
                  {step.label}
                </div>
              ) : (
                <div
                  className={cn(
                    "overflow-hidden rounded-md border border-white/15 bg-[#1E2430]/90 transition-all duration-500",
                    compact ? "min-w-[3.25rem]" : "min-w-[5.5rem]",
                    isActive && "border-teal-400/40 ring-1 ring-teal-400/30",
                  )}
                >
                  <div
                    className={cn(
                      "bg-teal-600/90 font-semibold text-white tabular-nums",
                      compact
                        ? "px-1.5 py-0.5 text-[8px]"
                        : "px-2 py-1 text-[10px]",
                    )}
                  >
                    {step.label}
                  </div>
                  {!compact ? (
                    <div className="px-2 py-1.5 text-[10px] text-slate-300">
                      {step.title}
                    </div>
                  ) : null}
                </div>
              )}
              {idx < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "relative h-px bg-white/20 overflow-visible",
                    compact ? "mx-1 w-4" : "mx-1.5 w-8 sm:w-12",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 rounded-full bg-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.9)] transition-all duration-700",
                      compact ? "size-1" : "size-1.5",
                      showPulseOnLink
                        ? "left-[85%] opacity-100"
                        : "left-0 opacity-40",
                    )}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!compact ? (
        <p className="mt-4 text-center font-mono text-[10px] tracking-wide text-teal-200/70">
          {"{{acctNo}}"} · extract → inject
        </p>
      ) : null}
    </div>
  );
}
