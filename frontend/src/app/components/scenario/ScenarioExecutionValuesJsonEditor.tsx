import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  mergeTemplateWithOverrides,
  overridesFromBodyDiff,
  setStepOverrides,
  type BindingOverrideSpec,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import { tryParseBodyObject } from "@/lib/parseRequestBodyJson";
import { cn } from "../ui/utils";

type Props = {
  stepKey: string;
  templateBody: Record<string, unknown> | null;
  overrides: BindingOverrideSpec[];
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
  resolvedPreview?: Record<string, unknown> | null;
  previewLoading?: boolean;
};

export function ScenarioExecutionValuesJsonEditor({
  stepKey,
  templateBody,
  overrides,
  bindings,
  onBindingsChange,
  resolvedPreview,
  previewLoading,
}: Props) {
  const template = useMemo(
    () =>
      templateBody && typeof templateBody === "object" ? templateBody : {},
    [templateBody],
  );

  const mergedBody = useMemo(
    () => mergeTemplateWithOverrides(template, overrides),
    [template, overrides],
  );

  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setJsonDirty(false);
  }, [stepKey]);

  useEffect(() => {
    if (!jsonDirty) {
      setJsonDraft(JSON.stringify(mergedBody, null, 2));
      setJsonError(null);
    }
  }, [mergedBody, jsonDirty, stepKey]);

  const applyJson = () => {
    const parsed = tryParseBodyObject(jsonDraft);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    const nextOverrides = overridesFromBodyDiff(template, parsed.value);
    onBindingsChange(setStepOverrides(bindings, stepKey, nextOverrides));
    setJsonDirty(false);
    setJsonError(null);
  };

  const resetFromTemplate = () => {
    onBindingsChange(setStepOverrides(bindings, stepKey, []));
    setJsonDirty(false);
    setJsonError(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        테스트케이스 요청 JSON을 그대로 편집합니다. 템플릿과 다른 필드만
        자동으로 덮어쓰기(override)로 저장됩니다.
      </p>
      <textarea
        className={cn(
          "w-full min-h-[min(280px,40vh)] rounded-sm border bg-background px-3 py-2 text-[11px] font-mono leading-relaxed",
          jsonError ? "border-destructive" : "border-border",
        )}
        value={jsonDraft}
        onChange={(e) => {
          setJsonDraft(e.target.value);
          setJsonDirty(true);
          setJsonError(null);
        }}
        spellCheck={false}
      />
      {jsonError ? (
        <p className="text-[11px] text-destructive flex gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {jsonError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="h-8 px-3 rounded-sm bg-primary text-primary-foreground text-[11px] font-medium"
          onClick={applyJson}
        >
          JSON 적용
        </button>
        <button
          type="button"
          className="h-8 px-3 rounded-sm border border-border text-[11px] hover:bg-muted"
          onClick={() => {
            setJsonDraft(JSON.stringify(mergedBody, null, 2));
            setJsonDirty(false);
            setJsonError(null);
          }}
        >
          되돌리기
        </button>
        <button
          type="button"
          className="h-8 px-3 rounded-sm border border-border text-[11px] text-muted-foreground hover:bg-muted"
          onClick={resetFromTemplate}
        >
          템플릿으로 초기화
        </button>
      </div>
      {previewLoading ? (
        <p className="text-[10px] text-muted-foreground">미리보기 갱신 중…</p>
      ) : null}
      {resolvedPreview ? (
        <div className="rounded-sm border border-border bg-muted/10 px-2 py-2">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">
            실행 시 요청 (inject 반영 후 미리보기)
          </p>
          <pre className="text-[10px] font-mono overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-foreground">
            {JSON.stringify(resolvedPreview, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
