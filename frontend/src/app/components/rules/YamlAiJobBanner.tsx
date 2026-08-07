import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixLoading } from "../ui/finix-loading";
import {
  useYamlAiJobStore,
  type YamlAiJob,
} from "@/app/stores/yamlAiJobStore";
import { YamlAiJobProgressPanel } from "./YamlAiJobProgressPanel";
import { cn } from "../ui/utils";

function headerSummary(jobs: YamlAiJob[]): string {
  const running = jobs.filter((j) => j.status === "running");
  if (running.length === 1) {
    const j = running[0];
    const stage = j.stages[j.stageIndex]?.label ?? "처리 중…";
    const prefix = j.kind === "postman" ? "Postman" : j.serviceCode;
    return `${prefix} · ${stage}`;
  }
  if (running.length > 1) {
    return `YAML 작업 ${running.length}건 진행 중`;
  }
  if (jobs.some((j) => j.needsOverwrite)) return "작업본 덮어쓰기 확인 필요";
  const success = jobs.filter((j) => j.status === "success").length;
  const error = jobs.filter((j) => j.status === "error").length;
  if (success && !error) return `YAML 작업 완료 ${success}건`;
  if (error && !success) return `YAML 작업 실패 ${error}건`;
  return `YAML 작업 ${jobs.length}건`;
}

/** Compact header chip; click opens shared progress modal. */
export function YamlAiJobBanner() {
  const jobs = useYamlAiJobStore((s) => s.jobs);
  const dismissJob = useYamlAiJobStore((s) => s.dismissJob);
  const retryOverwrite = useYamlAiJobStore((s) => s.retryOverwrite);
  const [detailOpen, setDetailOpen] = useState(false);
  const openedOverwriteIds = useRef(new Set<string>());
  const autoOpenedJobIds = useRef(new Set<string>());

  useEffect(() => {
    const pending = jobs.filter(
      (j) => j.status === "error" && j.needsOverwrite,
    );
    const fresh = pending.filter((j) => !openedOverwriteIds.current.has(j.id));
    if (fresh.length === 0) return;
    for (const j of fresh) openedOverwriteIds.current.add(j.id);
    setDetailOpen(true);
  }, [jobs]);

  useEffect(() => {
    const running = jobs.filter((j) => j.status === "running");
    const fresh = running.filter((j) => !autoOpenedJobIds.current.has(j.id));
    if (fresh.length === 0) return;
    for (const j of fresh) autoOpenedJobIds.current.add(j.id);
    setDetailOpen(true);
  }, [jobs]);

  if (jobs.length === 0) return null;

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const hasOverwrite = jobs.some(
    (j) => j.status === "error" && j.needsOverwrite,
  );
  const hasError = jobs.some((j) => j.status === "error") && !hasOverwrite;
  const allSuccess =
    jobs.length > 0 && jobs.every((j) => j.status === "success");

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 max-w-[min(100%,22rem)] h-9 px-2.5 rounded-sm border text-xs text-left transition-colors",
          runningCount > 0 && "border-border bg-muted/40 hover:bg-muted/60",
          allSuccess &&
            "border-border bg-background hover:bg-muted/50",
          hasOverwrite &&
            runningCount === 0 &&
            "border-border bg-muted/50 hover:bg-muted/70",
          hasError &&
            runningCount === 0 &&
            "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
          !runningCount &&
            !allSuccess &&
            !hasError &&
            !hasOverwrite &&
            "border-border bg-background hover:bg-muted/50",
        )}
        title="YAML 작업 상태 상세"
      >
        {runningCount > 0 ? (
          <FinixLoading size="sm" inline />
        ) : allSuccess ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
        ) : hasOverwrite ? (
          <AlertTriangle className="size-3.5 shrink-0 text-muted-foreground" />
        ) : hasError ? (
          <X className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate font-medium text-foreground">
          {headerSummary(jobs)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="!w-[min(32rem,calc(100vw-2rem))] !max-w-[min(32rem,calc(100vw-2rem))] sm:!max-w-[min(32rem,calc(100vw-2rem))] !h-[min(36rem,88vh)] gap-0 p-0 overflow-hidden overflow-x-hidden flex flex-col rounded-sm">
          <DialogHeader className="px-4 pt-4 pb-3 pr-12 border-b border-border text-left shrink-0">
            <DialogTitle className="text-sm font-medium tracking-tight">
              작업 진행
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              {runningCount > 0
                ? `${runningCount}건 진행 중`
                : hasOverwrite
                  ? "작업본 덮어쓰기 확인이 필요합니다"
                  : allSuccess
                    ? "모든 작업이 완료되었습니다"
                    : `${jobs.length}건`}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-3">
            {jobs.map((job) => (
              <li key={job.id} className="min-w-0 max-w-full">
                <YamlAiJobProgressPanel
                  job={job}
                  onDismiss={dismissJob}
                  onRetryOverwrite={retryOverwrite}
                />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
