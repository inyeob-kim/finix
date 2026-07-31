import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import type { YamlDiagnostic } from "@/lib/yamlDiagnostic";
import { cn } from "../ui/utils";

type Props = {
  diagnostic: YamlDiagnostic;
  onDismiss?: () => void;
  onJumpToLine?: (line: number) => void;
  className?: string;
};

export function YamlEditorDiagnosticBar({
  diagnostic,
  onDismiss,
  onJumpToLine,
  className,
}: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const canJump =
    diagnostic.line != null &&
    diagnostic.line > 0 &&
    typeof onJumpToLine === "function";

  return (
    <div
      className={cn(
        "rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-xs shrink-0",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-destructive leading-snug">
            {diagnostic.summary}
          </p>
          {diagnostic.hint ? (
            <p className="text-[11px] text-destructive/80 leading-snug">
              {diagnostic.hint}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {canJump ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-[11px] font-medium hover:bg-destructive/10"
              onClick={() => onJumpToLine?.(diagnostic.line!)}
            >
              <MapPin className="size-3" />
              {diagnostic.line}행
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-0.5 h-7 px-2 rounded-sm text-[11px] hover:bg-destructive/10"
            onClick={() => setDetailOpen((o) => !o)}
            aria-expanded={detailOpen}
          >
            상세
            {detailOpen ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
          {onDismiss ? (
            <button
              type="button"
              className="h-7 w-7 inline-flex items-center justify-center rounded-sm hover:bg-destructive/10"
              aria-label="닫기"
              onClick={onDismiss}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {detailOpen ? (
        <pre className="px-2.5 pb-2 pt-0 text-[10px] font-mono whitespace-pre-wrap break-words text-destructive/90 border-t border-destructive/20 max-h-28 overflow-y-auto">
          {diagnostic.detail}
        </pre>
      ) : null}
    </div>
  );
}
