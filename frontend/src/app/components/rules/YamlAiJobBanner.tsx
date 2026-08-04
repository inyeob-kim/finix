import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  FileJson2,
  Loader2,
  Sparkles,
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
    if (job.kind === "postman") {
      const n = job.postmanResult?.services.length ?? 0;
      const u = job.postmanResult?.unmatched.length ?? 0;
      if (n === 0) return "매칭된 서비스 없음";
      return u > 0
        ? `작업본 ${n}개 갱신 · 미매칭 ${u}건`
        : `작업본 ${n}개 갱신`;
    }
    return `초안 등록 완료 · v${job.bundle?.version ?? "—"}`;
  }
  if (job.status === "error") {
    return job.error ?? "작업 실패";
  }
  return job.stages[job.stageIndex]?.label ?? "처리 중…";
}

function statusTone(job: YamlAiJob): {
  badge: string;
  badgeClass: string;
  cardClass: string;
  barClass: string;
} {
  if (job.status === "running") {
    return {
      badge: "진행 중",
      badgeClass: "bg-primary/15 text-primary",
      cardClass: "border-border bg-card",
      barClass: "bg-primary",
    };
  }
  if (job.status === "success") {
    return {
      badge: "완료",
      badgeClass: "bg-primary/15 text-primary",
      cardClass: "border-primary/25 bg-primary/[0.06]",
      barClass: "bg-primary",
    };
  }
  if (job.needsOverwrite) {
    return {
      badge: "확인 필요",
      badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
      cardClass: "border-amber-500/30 bg-amber-500/[0.06]",
      barClass: "bg-amber-500/80",
    };
  }
  return {
    badge: "실패",
    badgeClass: "bg-destructive/10 text-destructive",
    cardClass: "border-destructive/30 bg-destructive/[0.04]",
    barClass: "bg-destructive/70",
  };
}

function JobDetailCard({
  job,
  onOpenBundle,
  onDismiss,
  onRetryOverwrite,
}: {
  job: YamlAiJob;
  onOpenBundle: (job: YamlAiJob) => void;
  onDismiss: (id: string) => void;
  onRetryOverwrite: (id: string) => void;
}) {
  const running = job.status === "running";
  const label = stageLabel(job);
  const tone = statusTone(job);
  const progress = Math.max(0, Math.min(100, Math.round(job.progress)));

  return (
    <article
      className={cn(
        "rounded-sm border overflow-hidden flex flex-col",
        tone.cardClass,
      )}
    >
      <div className="px-3.5 pt-3.5 pb-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-medium tracking-wide",
                  tone.badgeClass,
                )}
              >
                {tone.badge}
              </span>
              {job.kind === "postman" ? (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[10px] text-muted-foreground bg-muted/60">
                  <FileJson2 className="size-3" />
                  Postman
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-sm text-[10px] text-muted-foreground bg-muted/60">
                  <Sparkles className="size-3" />
                  소스
                </span>
              )}
            </div>
            <p className="text-sm font-mono font-medium text-foreground truncate">
              {job.serviceCode}
            </p>
          </div>
          {job.status !== "running" ? (
            <button
              type="button"
              aria-label="닫기"
              className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onDismiss(job.id)}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <p
          className={cn(
            "text-xs leading-relaxed",
            job.status === "error" && !job.needsOverwrite && "text-destructive",
            job.needsOverwrite && "text-foreground",
            job.status === "success" && "text-foreground",
            running && "text-muted-foreground",
          )}
        >
          {label}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{running ? "진행률" : "상태"}</span>
            <span className="font-mono tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                tone.barClass,
              )}
              style={{ width: `${Math.max(running ? 4 : 0, progress)}%` }}
            />
          </div>
        </div>

        {job.stages.length > 0 ? (
          <ol className="relative space-y-0 pl-0.5">
            {job.stages.map((stage, i) => {
              const done =
                job.status === "success" ||
                (running && i < job.stageIndex) ||
                (job.status === "error" && i < job.stageIndex);
              const current =
                (running && i === job.stageIndex) ||
                (job.status === "error" && i === job.stageIndex);
              const pending = !done && !current;
              return (
                <li
                  key={stage.id}
                  className="relative flex items-start gap-2.5 py-1"
                >
                  {i < job.stages.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-[5px] top-[18px] w-px h-[calc(100%-2px)]",
                        done && !current ? "bg-primary/40" : "bg-border",
                      )}
                    />
                  ) : null}
                  <span className="relative z-[1] mt-0.5 w-2.5 h-2.5 inline-flex items-center justify-center shrink-0">
                    {done && !current ? (
                      <Check
                        className="size-3 text-primary"
                        strokeWidth={2.5}
                      />
                    ) : current && running ? (
                      <Loader2 className="size-3 animate-spin text-primary" />
                    ) : current && job.status === "error" ? (
                      <span className="size-1.5 rounded-full bg-destructive" />
                    ) : (
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          pending ? "bg-border" : "bg-muted-foreground/40",
                        )}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-snug min-w-0 pt-px",
                      current && running && "text-foreground font-medium",
                      current &&
                        job.status === "error" &&
                        "text-destructive font-medium",
                      done && !current && "text-primary",
                      pending && "text-muted-foreground/70",
                    )}
                  >
                    {stage.label.replace(/ 중$/, "")}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {job.status === "success" &&
        job.kind === "postman" &&
        job.postmanResult &&
        job.postmanResult.services.length > 1 ? (
          <ul className="text-[11px] font-mono text-muted-foreground space-y-0.5 max-h-20 overflow-y-auto rounded-sm border border-border/70 bg-background/60 px-2.5 py-2">
            {job.postmanResult.services.map((s) => (
              <li key={s.service_code}>
                {s.service_code}
                <span className="text-muted-foreground/70">
                  {" "}
                  · {s.mode}/{s.engine}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {job.status === "error" && job.needsOverwrite ? (
        <div className="border-t border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-3 space-y-2.5">
          <div className="flex gap-2">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
            <p className="text-[11px] leading-relaxed text-foreground/90">
              이미 작업본이 있는 서비스가 포함되어 있습니다. 기존 작업본을
              덮어쓸지 확인하세요.
            </p>
          </div>
          <FinixPrimaryButton
            type="button"
            className="h-8 w-full text-xs"
            onClick={() => onRetryOverwrite(job.id)}
          >
            작업본 덮어쓰기
          </FinixPrimaryButton>
        </div>
      ) : null}

      {job.status === "success" && job.bundle ? (
        <div className="border-t border-border/80 bg-background/50 px-3.5 py-2.5 flex justify-end">
          <FinixPrimaryButton
            type="button"
            className="h-8 px-3 w-auto text-xs"
            onClick={() => onOpenBundle(job)}
          >
            작업본 열기
          </FinixPrimaryButton>
        </div>
      ) : null}
    </article>
  );
}

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
  const needsConfirm = jobs.some((j) => j.needsOverwrite);
  if (needsConfirm) return "작업본 덮어쓰기 확인 필요";
  const success = jobs.filter((j) => j.status === "success").length;
  const error = jobs.filter((j) => j.status === "error").length;
  if (success && !error) return `YAML 작업 완료 ${success}건`;
  if (error && !success) return `YAML 작업 실패 ${error}건`;
  return `YAML 작업 ${jobs.length}건`;
}

/** Compact header chip; click opens a fixed-size status modal. */
export function YamlAiJobBanner({ onOpenBundle }: Props) {
  const jobs = useYamlAiJobStore((s) => s.jobs);
  const dismissJob = useYamlAiJobStore((s) => s.dismissJob);
  const retryPostmanOverwrite = useYamlAiJobStore((s) => s.retryPostmanOverwrite);
  const [detailOpen, setDetailOpen] = useState(false);
  const openedOverwriteIds = useRef(new Set<string>());

  useEffect(() => {
    const pending = jobs.filter(
      (j) => j.status === "error" && j.needsOverwrite,
    );
    const fresh = pending.filter((j) => !openedOverwriteIds.current.has(j.id));
    if (fresh.length === 0) return;
    for (const j of fresh) openedOverwriteIds.current.add(j.id);
    setDetailOpen(true);
  }, [jobs]);

  if (jobs.length === 0) return null;

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const hasOverwrite = jobs.some(
    (j) => j.status === "error" && j.needsOverwrite,
  );
  const hasError =
    jobs.some((j) => j.status === "error") && !hasOverwrite;
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
            "border-primary/25 bg-primary/15 hover:bg-primary/20",
          hasOverwrite &&
            runningCount === 0 &&
            "border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/15",
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
          <AlertTriangle className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
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
        <DialogContent className="sm:max-w-md w-[min(28rem,calc(100vw-2rem))] h-[min(32rem,85vh)] gap-0 p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3.5 pr-12 border-b border-border text-left shrink-0 bg-muted/20">
            <DialogTitle className="text-base font-semibold tracking-tight">
              YAML 작업 상태
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {runningCount > 0
                ? `${runningCount}건 진행 중`
                : hasOverwrite
                  ? "작업본 덮어쓰기 확인이 필요합니다"
                  : allSuccess
                    ? "모든 작업이 완료되었습니다"
                    : `${jobs.length}건`}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-muted/10">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobDetailCard
                  job={job}
                  onOpenBundle={(j) => {
                    setDetailOpen(false);
                    onOpenBundle(j);
                  }}
                  onDismiss={dismissJob}
                  onRetryOverwrite={(id) => {
                    retryPostmanOverwrite(id);
                  }}
                />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
