import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

type AnimatedNumberProps = {
  /** Numeric target used for the count-up animation. */
  value: number;
  /** Text shown once the animation settles (e.g. "75%" or "1,204"). */
  display: string;
  durationSeconds?: number;
};

const DEFAULT_DURATION_SECONDS = 0.9;

/**
 * Counts up to ``value`` then swaps in ``display`` so formatted suffixes
 * (percent signs, thousand separators) stay authoritative.
 */
export function AnimatedNumber({
  value,
  display,
  durationSeconds = DEFAULT_DURATION_SECONDS,
}: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion();
  const [current, setCurrent] = useState(value);
  const [settled, setSettled] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion) {
      setCurrent(value);
      setSettled(true);
      return;
    }
    setSettled(false);
    const controls = animate(0, value, {
      duration: durationSeconds,
      ease: "easeOut",
      onUpdate: (latest) => setCurrent(latest),
      onComplete: () => setSettled(true),
    });
    return () => controls.stop();
  }, [value, durationSeconds, prefersReducedMotion]);

  if (settled) return <>{display}</>;
  return <>{Math.round(current).toLocaleString("ko-KR")}</>;
}
