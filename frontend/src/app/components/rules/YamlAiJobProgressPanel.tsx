import { useState } from "react";
import {
  AlertTriangle,
  FileJson2,
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
import { FinixPrimaryButton } from "../ui/finix-button";
import {
  FinixProgressSteps,
  type FinixProgressOverall,
} from "../ui/FinixProgressSteps";
import type { YamlAiJob } from "@/app/stores/yamlAiJobStore";

function jobOverall(job: YamlAiJob): FinixProgressOverall {
  if (job.status === "success") return "success";
  if (job.status === "error") return "error";
  return "running";
}

export function YamlAiJobProgressPanel({
  job,
  onDismiss,
  onRetryOverwrite,
}: {
  job: YamlAiJob;
  onDismiss: (id: string) => void;
  onRetryOverwrite: (id: string) => void;
}) {
  const running = job.status === "running";
  const finished = job.status !== "running";
  const [logOpen, setLogOpen] = useState(false);
  const lines = job.log ?? [];
  const overall = jobOverall(job);

  return (
    <>
      <article className="rounded-sm border border-border bg-card overflow-hidden flex flex-col min-w-0 max-w-full">
        <div className="px-3.5 pt-3 pb-3 space-y-3 min-w-0">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {job.kind === "postman" ? (
                  <span className="inline-flex items-center gap-1">
                    <FileJson2 className="size-3" />
                    Postman
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3" />
                    소스 → YAML
                  </span>
                )}
                <span className="text-border">·</span>
                <span>
                  {running
                    ? "진행 중"
                    : job.status === "success"
                      ? "완료"
                      : job.needsOverwrite
                        ? "확인 필요"
                        : "실패"}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">
                {job.serviceCode}
              </p>
            </div>
            {finished ? (
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

          <FinixProgressSteps
            steps={job.stages.map((s) => ({
              id: s.id,
              label: s.label,
              detail: s.detail,
            }))}
            currentIndex={job.stageIndex}
            status={overall}
            progress={job.progress}
            metaLeft={`${Math.min(job.stageIndex + 1, job.stages.length)} / ${job.stages.length}`}
            metaRight={
              running
                ? "진행 중"
                : job.status === "success"
                  ? "완료"
                  : job.needsOverwrite
                    ? "확인 필요"
                    : "실패"
            }
          />

          {job.status === "error" && !job.needsOverwrite && job.error ? (
            <p className="text-[11px] leading-relaxed text-destructive">
              {job.error}
            </p>
          ) : null}

          {job.status === "success" &&
          job.kind === "postman" &&
          job.postmanResult &&
          job.postmanResult.services.length > 1 ? (
            <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-16 overflow-y-auto border-t border-border/60 pt-2">
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

          {job.status === "success" && job.kind === "source" && job.bundle ? (
            <p className="text-[11px] text-muted-foreground">
              초안 등록 완료 · v{job.bundle.version ?? "—"}
            </p>
          ) : null}

          {job.status === "success" &&
          job.kind === "postman" &&
          job.postmanResult &&
          job.postmanResult.services.length <= 1 ? (
            <p className="text-[11px] text-muted-foreground">
              {job.postmanResult.services.length === 0
                ? "매칭된 서비스 없음"
                : `작업본 ${job.postmanResult.services.length}개 갱신`}
              {job.postmanResult.unmatched.length > 0
                ? ` · 미매칭 ${job.postmanResult.unmatched.length}건`
                : ""}
            </p>
          ) : null}
        </div>

        {job.status === "error" && job.needsOverwrite ? (
          <div className="border-t border-border px-3.5 py-3 space-y-2.5 bg-muted/30">
            <div className="flex gap-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {job.kind === "source"
                  ? "이미 작업본이 있습니다. 확인하면 기존 케이스에 소스 규칙을 병합합니다."
                  : "이미 작업본이 있는 서비스가 있습니다. 덮어쓸지 확인하세요."}
              </p>
            </div>
            <FinixPrimaryButton
              type="button"
              className="h-8 w-full text-xs"
              onClick={() => onRetryOverwrite(job.id)}
            >
              {job.kind === "source"
                ? "기존 작업본에 병합"
                : "작업본 덮어쓰기"}
            </FinixPrimaryButton>
          </div>
        ) : null}

        {finished && lines.length > 0 && !job.needsOverwrite ? (
          <div className="border-t border-border px-3.5 py-2.5 flex justify-end bg-muted/20">
            <FinixPrimaryButton
              type="button"
              className="h-8 px-3 w-auto text-xs"
              onClick={() => setLogOpen(true)}
            >
              로그 보기
            </FinixPrimaryButton>
          </div>
        ) : null}
      </article>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="z-[120] !w-[min(56rem,calc(100vw-2rem))] !max-w-[min(56rem,calc(100vw-2rem))] sm:!max-w-[min(56rem,calc(100vw-2rem))] !h-[calc(100dvh-5rem)] !max-h-[calc(100dvh-5rem)] gap-0 p-0 overflow-hidden flex flex-col rounded-sm">
          <DialogHeader className="px-5 pt-5 pb-3 pr-12 border-b border-border text-left shrink-0">
            <DialogTitle className="text-sm font-medium tracking-tight">
              작업 로그
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground truncate">
              {job.kind === "postman" ? "Postman" : "소스 → YAML"} ·{" "}
              {job.serviceCode}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <div className="space-y-2 text-[12px] leading-relaxed text-foreground/90">
              {lines.map((line) => (
                <p key={line.id}>
                  <span className="text-muted-foreground/45 select-none mr-1.5">
                    ›
                  </span>
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
