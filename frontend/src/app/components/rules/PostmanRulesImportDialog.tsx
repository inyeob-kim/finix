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
import { useYamlAiJobStore } from "@/app/stores/yamlAiJobStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PostmanRulesImportDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const startPostmanJob = useYamlAiJobStore((s) => s.startPostmanJob);
  const [fileName, setFileName] = useState<string | null>(null);
  const [collection, setCollection] = useState<unknown>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setFileName(null);
    setCollection(null);
    setParseError(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const loadText = async (text: string, name: string) => {
    setParseError(null);
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        parsed === null ||
        (typeof parsed !== "object" && !Array.isArray(parsed))
      ) {
        throw new Error("JSON 객체 또는 배열이어야 합니다.");
      }
      setCollection(parsed);
      setFileName(name);
    } catch (e) {
      setCollection(null);
      setFileName(null);
      setParseError(
        e instanceof Error ? e.message : "JSON을 파싱하지 못했습니다.",
      );
    }
  };

  const loadFile = async (file: File) => {
    const text = await file.text();
    await loadText(text, file.name);
  };

  const submit = () => {
    if (collection == null) return;
    startPostmanJob({
      collection,
      fileName,
      overwrite_draft: false,
    });
    reset();
    onOpenChange(false);
  };

  const canSubmit = collection != null && !parseError;

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
            Collection 또는 단일 Request JSON을 올리면 헤더의 작업 상태로
            진행 상황이 표시됩니다. 결과는{" "}
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
              const file = ev.dataTransfer.files?.[0];
              if (file) void loadFile(file);
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
              Postman Collection v2.1 / Request export
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />
          </div>

          {fileName ? (
            <div className="flex items-center gap-2 text-foreground">
              <FileJson className="w-4 h-4 shrink-0" />
              <span className="truncate font-mono text-xs">{fileName}</span>
            </div>
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
