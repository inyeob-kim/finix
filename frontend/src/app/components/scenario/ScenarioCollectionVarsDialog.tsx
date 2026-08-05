import { useEffect, useRef, useState } from "react";
import { normalizePostmanConfigWithMeta, type ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ScenarioPostmanHeaderRows } from "./ScenarioPostmanHeaderRows";
import { ScenarioCollectionVarsEditor } from "./ScenarioCollectionVarsEditor";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  /** Stack above nested run dialogs (e.g. z-[130]). */
  contentClassName?: string;
  description?: string;
};

export function ScenarioCollectionVarsDialog({
  open,
  onOpenChange,
  config,
  onChange,
  contentClassName,
  description = "채널 헤더 변수와 추가 HTTP 헤더를 설정합니다.",
}: Props) {
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const normalizedOnOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      normalizedOnOpenRef.current = false;
      setCleanupNote(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || normalizedOnOpenRef.current) return;
    normalizedOnOpenRef.current = true;
    const { config: normalized, migratedHeaderCount } =
      normalizePostmanConfigWithMeta(config);
    if (migratedHeaderCount > 0) {
      onChange(normalized);
      setCleanupNote(
        `중복 채널 헤더 ${migratedHeaderCount}건을 헤더 변수로 정리했습니다.`,
      );
    }
  }, [open, config, onChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-w-lg rounded-sm flex flex-col gap-0 p-0 overflow-hidden",
          "h-[min(560px,88vh)] max-h-[88vh]",
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="pr-8">헤더 설정</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {cleanupNote ? (
          <p className="shrink-0 mx-6 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-sm px-2.5 py-1.5">
            {cleanupNote}
          </p>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-3 space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-medium">헤더 변수</h3>
            <div className="border border-border/60 rounded-sm bg-muted/10 p-2">
              <ScenarioCollectionVarsEditor
                config={config}
                onChange={onChange}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium">추가 헤더</h3>
            <div className="border border-border/60 rounded-sm bg-muted/10 p-2">
              <ScenarioPostmanHeaderRows
                config={config}
                onChange={onChange}
                hideHeader
              />
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2 border-t border-border">
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
