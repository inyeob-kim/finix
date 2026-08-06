import { useEffect, useState, type ReactNode } from "react";
import {
  hasFinixTaglineIntroPlayed,
  markFinixTaglineIntroPlayed,
} from "@/lib/finixBrandTagline";
import { cn } from "./ui/utils";

type Phase = "compact" | "expand" | "done";

const COMPACT_HOLD_MS = 1_800;
/** CSS spread duration + tail buffer */
const EXPAND_MS = 4_600;

/** Slow start & end — avoids the “snap open” feel on gap / margin. */
const SPREAD_MOTION =
  "transition-[margin-left,letter-spacing,gap] duration-[4000ms] ease-in-out";

const FILLER_MOTION =
  "transition-[max-width,opacity] duration-[3600ms] ease-in-out";

function ExpandFiller({
  expanded,
  children,
  delayMs,
  className,
}: {
  expanded: boolean;
  children: string;
  delayMs: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        FILLER_MOTION,
        "inline-block overflow-hidden align-baseline whitespace-nowrap text-white/85",
        expanded ? "max-w-[12rem] opacity-100" : "max-w-0 opacity-0",
        className,
      )}
      style={{ transitionDelay: expanded ? `${delayMs}ms` : "0ms" }}
      aria-hidden={!expanded}
    >
      <span className="inline-block">{children}</span>
    </span>
  );
}

function WordGroup({
  expanded,
  spreadDelayMs,
  compactPullClass,
  className,
  children,
}: {
  expanded: boolean;
  spreadDelayMs: number;
  compactPullClass?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        SPREAD_MOTION,
        "inline-flex items-baseline",
        expanded ? "ml-[0.44em]" : compactPullClass ?? "ml-0",
        className,
      )}
      style={{ transitionDelay: expanded ? `${spreadDelayMs}ms` : "0ms" }}
    >
      {children}
    </span>
  );
}

function TaglineSpread({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline whitespace-nowrap text-[11px] font-medium sm:text-xs",
        SPREAD_MOTION,
        expanded ? "tracking-normal" : "tracking-[0.14em]",
      )}
      aria-label="Finance Intelligence eXecution"
    >
      {/* FIN → Finance */}
      <span className="inline-flex items-baseline">
        <span className="shrink-0 font-semibold text-teal-300">FIN</span>
        <ExpandFiller expanded={expanded} delayMs={500}>
          ance
        </ExpandFiller>
      </span>

      {/* I → Intelligence */}
      <WordGroup expanded={expanded} spreadDelayMs={0} compactPullClass="-ml-[0.05em]">
        <span className="shrink-0 font-semibold text-teal-300">I</span>
        <ExpandFiller expanded={expanded} delayMs={1_050}>
          ntelligence
        </ExpandFiller>
      </WordGroup>

      {/* X → eXecution */}
      <WordGroup expanded={expanded} spreadDelayMs={180} compactPullClass="-ml-[0.07em]">
        <ExpandFiller
          expanded={expanded}
          delayMs={1_550}
          className="text-white/85"
        >
          e
        </ExpandFiller>
        <span className="shrink-0 font-semibold text-teal-300">X</span>
        <ExpandFiller expanded={expanded} delayMs={1_750}>
          ecution
        </ExpandFiller>
      </WordGroup>
    </span>
  );
}

/**
 * FIN → Finance, I → Intelligence, X → eXecution.
 * Anchor letters spread apart; filler text grows in smoothly.
 */
export function FinixBrandTagline() {
  const [phase, setPhase] = useState<Phase>(() =>
    hasFinixTaglineIntroPlayed() ? "done" : "compact",
  );

  useEffect(() => {
    if (hasFinixTaglineIntroPlayed()) {
      setPhase("done");
      return;
    }

    setPhase("compact");
    const expandTimer = window.setTimeout(
      () => setPhase("expand"),
      COMPACT_HOLD_MS,
    );
    const doneTimer = window.setTimeout(() => {
      setPhase("done");
      markFinixTaglineIntroPlayed();
    }, COMPACT_HOLD_MS + EXPAND_MS);

    return () => {
      window.clearTimeout(expandTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  const expanded = phase === "expand" || phase === "done";

  return (
    <div className="min-w-0 overflow-hidden">
      <TaglineSpread expanded={expanded} />
    </div>
  );
}
