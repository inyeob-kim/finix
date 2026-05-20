import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { Loader2 } from "lucide-react";
import finixLoadingAnimation from "@/assets/finix_loading.json";
import { cn } from "./utils";

const SIZE_PX = {
  sm: 20,
  md: 48,
  lg: 80,
} as const;

export type FinixLoadingSize = keyof typeof SIZE_PX;

export type FinixLoadingProps = {
  size?: FinixLoadingSize;
  /** Visible loading message (also used for aria-label when set). */
  label?: string;
  /** Center in a flex container with optional min height (page / modal). */
  center?: boolean;
  className?: string;
  inline?: boolean;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function FinixLoading({
  size = "md",
  label,
  center = false,
  className,
  inline = false,
}: FinixLoadingProps) {
  const reducedMotion = usePrefersReducedMotion();
  const px = SIZE_PX[size];
  const ariaLabel = label ?? "로딩 중";

  const spinner = reducedMotion ? (
    <Loader2
      className={cn(
        "animate-spin text-primary shrink-0",
        size === "sm" && "w-4 h-4",
        size === "md" && "w-6 h-6",
        size === "lg" && "w-8 h-8",
      )}
      aria-hidden
    />
  ) : size === "sm" ? (
    <Loader2
      className="w-4 h-4 animate-spin text-primary shrink-0"
      aria-hidden
    />
  ) : (
    <Lottie
      animationData={finixLoadingAnimation}
      loop
      className="shrink-0"
      style={{ width: px, height: px }}
      aria-hidden
    />
  );

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      className={cn(
        inline
          ? "inline-flex items-center gap-2"
          : "flex flex-col items-center gap-2",
        className,
      )}
    >
      {spinner}
      {label ? (
        <span
          className={cn(
            "text-muted-foreground",
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );

  if (!center) return content;

  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center w-full",
        size === "lg" && "min-h-[12rem]",
        size === "md" && "min-h-[8rem]",
      )}
    >
      {content}
    </div>
  );
}

/** Full-viewport loading shell (scenario / test-case initial fetch). */
export function FinixLoadingPage({
  label = "불러오는 중…",
}: {
  label?: string;
}) {
  return (
    <div className="min-h-full h-full flex-1 bg-secondary flex items-center justify-center p-8">
      <FinixLoading size="lg" label={label} center />
    </div>
  );
}
