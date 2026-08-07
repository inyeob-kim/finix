import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FileJson, Upload } from "lucide-react";
import { ApiError } from "@/api/client";
import { preflightServiceRulesFromPostman } from "@/api/serviceRulesApi";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { FINIX_COMPACT_MODAL_CONTENT } from "@/lib/finixModalLayout";
import {
  assignPostmanImportFiles,
  validatePostmanImportReady,
} from "@/lib/postmanImportClassify";
import { useYamlAiJobStore } from "@/app/stores/yamlAiJobStore";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PostmanRulesImportDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const startPostmanJob = useYamlAiJobStore((s) => s.startPostmanJob);
  const [collection, setCollection] = useState<unknown>(null);
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<unknown>(null);
  const [environmentName, setEnvironmentName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [draftServices, setDraftServices] = useState<string[] | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);

  const reset = useCallback(() => {
    setCollection(null);
    setCollectionName(null);
    setEnvironment(null);
    setEnvironmentName(null);
    setParseError(null);
    setDragOver(false);
    setPreflightLoading(false);
    setDraftServices(null);
    setMatchedCount(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const applyFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setParseError(null);
    setDraftServices(null);
    setMatchedCount(null);
    try {
      const parsed: Array<{ name: string; payload: unknown }> = [];
      for (const file of files) {
        const text = await file.text();
        const payload: unknown = JSON.parse(text);
        if (
          payload === null ||
          (typeof payload !== "object" && !Array.isArray(payload))
        ) {
          throw new Error(`${file.name}: JSON 객체 또는 배열이어야 합니다.`);
        }
        parsed.push({ name: file.name, payload });
      }
      const assigned = assignPostmanImportFiles(parsed);
      if (assigned.error) {
        setParseError(assigned.error);
        return;
      }
      // Merge into existing slots so env-only / collection-only drops both work.
      if (assigned.collection != null) {
        setCollection(assigned.collection);
        setCollectionName(assigned.collectionName);
      }
      if (assigned.environment != null) {
        setEnvironment(assigned.environment);
        setEnvironmentName(assigned.environmentName);
      }
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "JSON을 파싱하지 못했습니다.",
      );
    }
  };

  const launchImport = (overwriteDraft: boolean) => {
    startPostmanJob({
      collection,
      environment,
      fileName: collectionName,
      environmentFileName: environmentName,
      overwrite_draft: overwriteDraft,
    });
    reset();
    onOpenChange(false);
  };

  const submit = async () => {
    const readyError = validatePostmanImportReady({ collection });
    if (readyError) {
      setParseError(readyError);
      return;
    }
    setParseError(null);
    setPreflightLoading(true);
    try {
      const preflight = await preflightServiceRulesFromPostman({
        collection,
        environment,
      });
      setMatchedCount(preflight.matched_services.length);
      if (preflight.draft_services.length > 0) {
        setDraftServices(preflight.draft_services);
        return;
      }
      launchImport(false);
    } catch (e) {
      setParseError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "가져오기 사전 확인에 실패했습니다.",
      );
    } finally {
      setPreflightLoading(false);
    }
  };

  const hasAnyFile = collection != null || environment != null;
  const canSubmit = hasAnyFile && !preflightLoading;
  const awaitingOverwrite = draftServices != null && draftServices.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(FINIX_COMPACT_MODAL_CONTENT, "rounded-sm")}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-left shrink-0">
          <DialogTitle className="text-base font-semibold">
            Postman에서 YAML 가져오기
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed text-xs">
            Collection(또는 단일 Request)은 필수이고, Environment는 선택입니다.
            Environment 값은 Collection 변수보다 우선해{" "}
            <span className="font-mono text-[11px]">{"{{var}}"}</span>를 채운 뒤
            규칙화합니다. 결과는{" "}
            <strong className="font-medium text-foreground">작업본</strong>
            만 갱신합니다.
          </p>

          {!awaitingOverwrite ? (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(ev) => {
                ev.preventDefault();
                setDragOver(false);
                const list = ev.dataTransfer.files;
                if (list?.length) void applyFiles(list);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed px-4 py-10 min-h-[10rem] cursor-pointer transition-colors ${
                dragOver
                  ? "border-foreground/50 bg-muted/80"
                  : "border-muted-foreground/45 bg-muted/55 hover:border-muted-foreground/65 hover:bg-muted/70"
              }`}
            >
              <Upload
                className="w-7 h-7 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="text-sm text-foreground font-medium text-center">
                JSON 파일을 끌어다 놓거나 클릭
              </span>
              <span className="text-xs text-muted-foreground text-center">
                Collection + Environment (따로 올려도 됨)
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                multiple
                className="hidden"
                onChange={(ev) => {
                  const list = ev.target.files;
                  if (list?.length) void applyFiles(list);
                }}
              />
            </div>
          ) : null}

          {collectionName || environmentName ? (
            <ul className="space-y-1.5">
              {collectionName ? (
                <li className="flex items-center gap-2 text-foreground">
                  <FileJson className="w-4 h-4 shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0">
                    Collection
                  </span>
                  <span className="truncate font-mono text-xs">
                    {collectionName}
                  </span>
                </li>
              ) : null}
              {environmentName ? (
                <li className="flex items-center gap-2 text-foreground">
                  <FileJson className="w-4 h-4 shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0">
                    Environment
                  </span>
                  <span className="truncate font-mono text-xs">
                    {environmentName}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          {awaitingOverwrite ? (
            <div className="rounded-sm border border-amber-500/40 bg-amber-500/[0.08] px-3 py-3 space-y-2">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    작업본이 있는 서비스가 있습니다
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    매칭 {matchedCount ?? "—"}개 중{" "}
                    {draftServices!.length}개에 기존 작업본이 있습니다. 덮어쓰면
                    해당 서비스 작업본이 교체됩니다.
                  </p>
                  <p className="font-mono text-[11px] text-foreground break-all">
                    {draftServices!.join(", ")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {parseError ? (
            <p className="text-destructive text-sm">{parseError}</p>
          ) : null}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20 shrink-0 justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 text-xs rounded-sm border border-border bg-background hover:bg-muted"
            onClick={() => {
              if (awaitingOverwrite) {
                setDraftServices(null);
                return;
              }
              handleOpenChange(false);
            }}
          >
            {awaitingOverwrite ? "뒤로" : "취소"}
          </button>
          {awaitingOverwrite ? (
            <FinixPrimaryButton
              type="button"
              className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
              onClick={() => launchImport(true)}
            >
              덮어쓰고 가져오기
            </FinixPrimaryButton>
          ) : (
            <FinixPrimaryButton
              type="button"
              className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {preflightLoading ? <FinixLoading size="sm" inline /> : null}
              {preflightLoading ? "확인 중…" : "작업본으로 가져오기"}
            </FinixPrimaryButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
