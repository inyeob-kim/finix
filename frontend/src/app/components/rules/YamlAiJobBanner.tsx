import { useState } from "react";
import { Check, CheckCircle2, ChevronRight, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixLoading } from "../ui/finix-loading";
import { FinixPrimaryButton } from "../ui/finix-button";
import {
  useYamlAiJobStore,
  type YamlAiJob,
} from "@/app/stores/yamlAiJobStore";
import { cn } from "../ui/utils";

type Props = {
  onOpenBundle: (job: YamlAiJob) => void;
};

function stageLabel(job: YamlAiJob): string {
  if (job.status === "success") {
    return `초안 등록 완료 · v${job.bundle?.version ?? "—"}`;
  }
  if (job.status === "error") {
    return job.error ?? "생성 실패";
  }
  return job.stages[job.stageIndex]?.label ?? "처리 중…";
}

function JobDetailCard({
  job,
  onOpenBundle,
  onDismiss,
}: {
  job: YamlAiJob;
  onOpenBundle: (job: YamlAiJob) => void;
  onDismiss: (id: string) => void;
}) {
  const running = job.status === "running";
  const label = stageLabel(job);

  return (
    <div
      className={cn(
        "rounded-sm border px-3 py-3 space-y-3",
        running && "border-border bg-muted/20",
        job.status === "success" && "border-primary/25 bg-primary/10",
        job.status === "error" &&
          "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            {job.status === "success" ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
            ) : running ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            ) : null}
            <p className="text-sm font-mono font-medium text-foreground">
              {job.serviceCode}
            </p>
          </div>
          <p
            className={cn(
              "text-xs leading-snug line-clamp-2",
              job.status === "error" && "text-destructive",
              job.status === "success" && "text-foreground",
              running && "text-muted-foreground",
            )}
            title={label}
          >
            {label}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 h-7">
          {job.status === "success" && job.bundle ? (
            <FinixPrimaryButton
              type="button"
              className="h-7 px-2.5 w-auto text-[11px]"
              onClick={() => onOpenBundle(job)}
            >
              열기
            </FinixPrimaryButton>
          ) : null}
          {job.status !== "running" ? (
            <button
              type="button"
              aria-label="닫기"
              className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onDismiss(job.id)}
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <span className="h-7 w-7" aria-hidden />
          )}
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            job.status === "error" ? "bg-destructive/70" : "bg-primary",
          )}
          style={{
            width: `${Math.max(4, Math.min(100, job.progress))}%`,
          }}
        />
      </div>

      {job.stages.length > 0 ? (
        <ol className="space-y-1.5">
          {job.stages.map((stage, i) => {
            const done =
              job.status === "success" ||
              (running && i < job.stageIndex) ||
              (job.status === "error" && i < job.stageIndex);
            const current =
              (running && i === job.stageIndex) ||
              (job.status === "error" && i === job.stageIndex);
            return (
              <li
                key={stage.id}
                className={cn(
                  "text-[11px] flex items-center gap-2",
                  current && running && "text-foreground font-medium",
                  current &&
                    job.status === "error" &&
                    "text-destructive font-medium",
                  done && !current && "text-primary",
                  !done && !current && "text-muted-foreground/70",
                )}
              >
                <span className="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0">
                  {done && !current ? (
                    <Check className="size-3 text-primary" strokeWidth={2.5} />
                  ) : current && running ? (
                    <Loader2 className="size-3 animate-spin text-primary" />
                  ) : current && job.status === "error" ? (
                    <span className="size-1.5 rounded-full bg-destructive" />
                  ) : (
                    <span className="size-1 rounded-full bg-border" />
                  )}
                </span>
                <span className="truncate">
                  {stage.label.replace(/ 중$/, "")}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function headerSummary(jobs: YamlAiJob[]): string {
  const running = jobs.filter((j) => j.status === "running");
  if (running.length === 1) {
    const j = running[0];
    const stage = j.stages[j.stageIndex]?.label ?? "생성 중…";
    return `${j.serviceCode} · ${stage}`;
  }
  if (running.length > 1) {
    return `YAML 생성 ${running.length}건 진행 중`;
  }
  const success = jobs.filter((j) => j.status === "success").length;
  const error = jobs.filter((j) => j.status === "error").length;
  if (success && !error) return `YAML 생성 완료 ${success}건`;
  if (error && !success) return `YAML 생성 실패 ${error}건`;
  return `YAML 생성 ${jobs.length}건`;
}

/** Compact header chip; click opens a fixed-size status modal. */
export function YamlAiJobBanner({ onOpenBundle }: Props) {
  const jobs = useYamlAiJobStore((s) => s.jobs);
  const dismissJob = useYamlAiJobStore((s) => s.dismissJob);
  const [detailOpen, setDetailOpen] = useState(false);

  if (jobs.length === 0) return null;

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const hasError = jobs.some((j) => j.status === "error");
  const allSuccess =
    jobs.length > 0 && jobs.every((j) => j.status === "success");

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 max-w-[min(100%,20rem)] h-9 px-2.5 rounded-sm border text-xs text-left transition-colors",
          runningCount > 0 && "border-border bg-muted/40 hover:bg-muted/60",
          allSuccess &&
            "border-primary/25 bg-primary/15 hover:bg-primary/20",
          hasError &&
            runningCount === 0 &&
            "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
          !runningCount &&
            !allSuccess &&
            !hasError &&
            "border-border bg-background hover:bg-muted/50",
        )}
        title="YAML 생성 상태 상세"
      >
        {runningCount > 0 ? (
          <FinixLoading size="sm" inline />
        ) : allSuccess ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
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
        <DialogContent className="sm:max-w-md w-[min(28rem,calc(100vw-2rem))] h-[28rem] max-h-[85vh] gap-0 p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-left shrink-0">
            <DialogTitle className="text-base font-semibold">
              YAML 생성 상태
            </DialogTitle>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobDetailCard
                  job={job}
                  onOpenBundle={(j) => {
                    setDetailOpen(false);
                    onOpenBundle(j);
                  }}
                  onDismiss={dismissJob}
                />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
