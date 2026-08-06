import { useEffect, useRef, useState } from "react";
import { cn } from "../ui/utils";

const FADE_MS = 320;

type RulesMetaFooterMessageProps = {
  message: string | null;
  className?: string;
  autoDismissMs?: number;
  onDismiss?: () => void;
};

export function RulesMetaFooterMessage({
  message,
  className,
  autoDismissMs = 0,
  onDismiss,
}: RulesMetaFooterMessageProps) {
  const [text, setText] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (message) {
      setText(message);
      setVisible(false);
      const showTimer = window.setTimeout(() => setVisible(true), 16);
      if (autoDismissMs > 0 && onDismiss) {
        dismissTimerRef.current = window.setTimeout(onDismiss, autoDismissMs);
      }
      return () => window.clearTimeout(showTimer);
    }

    setVisible(false);
    hideTimerRef.current = window.setTimeout(() => setText(null), FADE_MS);

    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [message, autoDismissMs, onDismiss]);

  if (!text) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "w-full text-left text-xs transition-all ease-in-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
        className,
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {text}
    </p>
  );
}
