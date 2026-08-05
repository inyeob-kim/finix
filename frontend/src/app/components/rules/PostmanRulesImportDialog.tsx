import { useCallback, useRef, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FINIX_LARGE_MODAL_CONTENT } from "@/lib/finixModalLayout";
import {
  assignPostmanImportFiles,
  validatePostmanImportReady,
} from "@/lib/postmanImportClassify";
import { useYamlAiJobStore } from "@/app/stores/yamlAiJobStore";

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

  const reset = useCallback(() => {
    setCollection(null);
    setCollectionName(null);
    setEnvironment(null);
    setEnvironmentName(null);
    setParseError(null);
    setDragOver(false);
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

  const submit = () => {
    const readyError = validatePostmanImportReady({ collection });
    if (readyError) {
      setParseError(readyError);
      return;
    }
    startPostmanJob({
      collection,
      environment,
      fileName: collectionName,
      environmentFileName: environmentName,
      overwrite_draft: false,
    });
    reset();
    onOpenChange(false);
  };

  const hasAnyFile = collection != null || environment != null;
  const canSubmit = hasAnyFile;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={FINIX_LARGE_MODAL_CONTENT}>
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border text-left shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Postman에서 YAML 가져오기
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Collection(또는 단일 Request)은 필수이고, Environment는 선택입니다.
            파일을 따로 올려도 됩니다. Environment 값은 Collection 변수보다 우선해{" "}
            <span className="font-mono text-xs">{"{{var}}"}</span>를 채운 뒤
            규칙화합니다. 결과는{" "}
            <strong className="font-medium text-foreground">작업본</strong>
            만 갱신하며, 적용은 편집 화면에서 하세요.
          </p>

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
            className={`flex flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed px-6 py-16 min-h-[14rem] cursor-pointer transition-colors ${
              dragOver
                ? "border-foreground/50 bg-muted/80"
                : "border-muted-foreground/45 bg-muted/55 hover:border-muted-foreground/65 hover:bg-muted/70"
            }`}
          >
            <Upload className="w-8 h-8 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-base text-foreground font-medium">
              JSON 파일을 끌어다 놓거나 클릭
            </span>
            <span className="text-sm text-muted-foreground">
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

          {parseError ? (
            <p className="text-destructive text-sm">{parseError}</p>
          ) : null}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 text-xs rounded-sm border border-border bg-background hover:bg-muted"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </button>
          <FinixPrimaryButton
            type="button"
            className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
            disabled={!canSubmit}
            onClick={submit}
          >
            작업본으로 가져오기
          </FinixPrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
