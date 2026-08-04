import { useEffect, useState } from "react";
import { cn } from "./ui/utils";

const STEPS = [
  { id: "start", label: "Start", kind: "pill" as const },
  { id: "tc1", label: "TC01", kind: "step" as const, title: "조회" },
  { id: "tc2", label: "TC02", kind: "step" as const, title: "이체" },
  { id: "end", label: "End", kind: "pill" as const },
];

/**
 * Login hero motion: Start → cases → End with a traveling data pulse.
 * Mirrors in-app scenario flow language without video assets.
 */
export function LoginScenarioFlow({ className }: { className?: string }) {
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
        "relative w-full max-w-xl select-none",
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((step, idx) => {
          const isActive = pulseAt === idx || pulseAt === idx - 1;
          const showPulseOnLink = pulseAt === idx;
          return (
            <div key={step.id} className="flex items-center">
              {step.kind === "pill" ? (
                <div
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white transition-all duration-500",
                    step.id === "start" ? "bg-slate-500" : "bg-slate-500",
                    isActive && "ring-2 ring-teal-400/50 scale-[1.03]",
                  )}
                >
                  {step.label}
                </div>
              ) : (
                <div
                  className={cn(
                    "min-w-[5.5rem] overflow-hidden rounded-md border border-white/15 bg-[#1E2430]/90 transition-all duration-500",
                    isActive && "border-teal-400/40 ring-1 ring-teal-400/30",
                  )}
                >
                  <div className="bg-teal-600/90 px-2 py-1 text-[10px] font-semibold text-white tabular-nums">
                    {step.label}
                  </div>
                  <div className="px-2 py-1.5 text-[10px] text-slate-300">
                    {step.title}
                  </div>
                </div>
              )}
              {idx < STEPS.length - 1 ? (
                <div className="relative mx-1.5 h-px w-8 sm:w-12 bg-white/20 overflow-visible">
                  <span
                    className={cn(
                      "absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.9)] transition-all duration-700",
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
      <p className="mt-4 text-center font-mono text-[10px] tracking-wide text-teal-200/70">
        {"{{acctNo}}"} · extract → inject
      </p>
    </div>
  );
}
