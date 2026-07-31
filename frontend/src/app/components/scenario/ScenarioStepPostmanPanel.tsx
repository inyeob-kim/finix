import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import type { ScenarioResolvePreviewDto } from "@/api/types";
import {
  emptyStepBinding,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  bodyForPostmanEditor,
  listAvailablePostmanVars,
  parsePostmanBody,
  setStepPostmanBodyBindings,
  formatPostmanVar,
} from "@/lib/postmanBodyBindings";
import { insertOrReplaceJsonStringValue } from "@/lib/jsonStringReplace";
import {
  runStepCaseIdLabel,
  runStepShortDescription,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import { ScenarioStepPostmanTests } from "./ScenarioStepPostmanTests";
import {
  ScenarioStepPostmanVarBar,
  type CollectionVarDeclarePayload,
} from "./ScenarioStepPostmanVarBar";
import type { PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";

type PanelTab = "input" | "output";

type Props = {
  runSteps: ScenarioRunStep[];
  stepIndex: number;
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
  startVarKeys: readonly string[];
  collectionVars?: readonly PostmanStartVar[];
  preview: ScenarioResolvePreviewDto | null;
  previewLoading?: boolean;
  onClose?: () => void;
  onAddCustomVar?: (payload: CollectionVarDeclarePayload) => void;
  onRemoveCustomVar?: (key: string) => void;
};

export function ScenarioStepPostmanPanel({
  runSteps,
  stepIndex,
  bindings,
  onBindingsChange,
  startVarKeys,
  collectionVars = [],
  preview,
  previewLoading = false,
  onClose,
  onAddCustomVar,
  onRemoveCustomVar,
}: Props) {
  const step = runSteps[stepIndex];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<PanelTab>("input");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const cfg = step
    ? (bindings[step.stepKey] ?? emptyStepBinding())
    : emptyStepBinding();

  const previewRow = preview?.steps?.[stepIndex];
  const templateBody =
    previewRow?.template_request_body &&
    typeof previewRow.template_request_body === "object"
      ? (previewRow.template_request_body as Record<string, unknown>)
      : {};

  const editorBody = useMemo(
    () => bodyForPostmanEditor(templateBody, cfg.overrides, cfg.injects),
    [templateBody, cfg.overrides, cfg.injects],
  );

  const availableVars = useMemo(
    () =>
      listAvailablePostmanVars(runSteps, bindings, startVarKeys, stepIndex),
    [runSteps, bindings, startVarKeys, stepIndex],
  );

  useEffect(() => {
    setTab("input");
    setJsonDirty(false);
    setJsonError(null);
  }, [step?.stepKey]);

  useEffect(() => {
    if (!jsonDirty) {
      setJsonDraft(JSON.stringify(editorBody, null, 2));
      setJsonError(null);
    }
  }, [editorBody, jsonDirty, step?.stepKey]);

  if (!step) return null;

  const applyDraft = (draft: string): boolean => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("최상위는 JSON 객체여야 합니다.");
        return false;
      }
      onBindingsChange(
        setStepPostmanBodyBindings(
          bindings,
          step.stepKey,
          parsePostmanBody(templateBody, parsed as Record<string, unknown>),
        ),
      );
      setJsonDirty(false);
      return true;
    } catch {
      setJsonError("JSON 형식이 올바르지 않습니다.");
      return false;
    }
  };

  const insertVar = (name: string) => {
    const token = `"${formatPostmanVar(name)}"`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? jsonDraft.length;
    const end = el?.selectionEnd ?? start;
    const { next, cursor } = insertOrReplaceJsonStringValue(
      jsonDraft,
      start,
      end,
      token,
    );
    setJsonDraft(next);
    setJsonError(null);

    const applied = applyDraft(next);
    if (!applied) setJsonDirty(true);

    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(cursor, cursor);
    });
  };

  const title =
    runStepShortDescription(step) || step.title?.trim() || step.serviceCode;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-border bg-card lg:w-[min(26rem,100%)]">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium font-mono text-primary truncate">
            {runStepCaseIdLabel(step)}
          </p>
          <p className="text-[11px] text-foreground line-clamp-2 mt-0.5">
            {title}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 flex gap-1 border-b border-border px-3 py-1.5">
        {(
          [
            { id: "input" as const, label: "Input" },
            {
              id: "output" as const,
              label: `Output${cfg.extracts.length ? ` (${cfg.extracts.length})` : ""}`,
            },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-7 px-2.5 rounded-sm text-[11px] font-medium",
              tab === t.id
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tab === "input" ? (
          <>
            <ScenarioStepPostmanVarBar
              availableVars={availableVars}
              collectionVars={collectionVars}
              onInsertVar={insertVar}
              onAddCustomVar={onAddCustomVar}
              onRemoveCustomVar={onRemoveCustomVar}
            />

            {previewLoading && !previewRow ? (
              <FinixLoading inline label="불러오는 중…" />
            ) : (
              <textarea
                ref={textareaRef}
                className={cn(
                  "w-full min-h-[min(320px,50vh)] rounded-sm border bg-background px-3 py-2 text-[11px] font-mono leading-relaxed",
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
            )}
            {jsonError ? (
              <p className="text-[11px] text-destructive flex gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {jsonError}
              </p>
            ) : null}
          </>
        ) : (
          <ScenarioStepPostmanTests
            step={step}
            bindings={bindings}
            onBindingsChange={onBindingsChange}
          />
        )}
      </div>

      {tab === "input" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border p-3">
          <button
            type="button"
            className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
            disabled={!jsonDirty}
            onClick={() => {
              setJsonDraft(JSON.stringify(editorBody, null, 2));
              setJsonDirty(false);
              setJsonError(null);
            }}
          >
            되돌리기
          </button>
          <FinixPrimaryButton
            type="button"
            className="ml-auto h-8 px-3 text-xs"
            disabled={!jsonDirty}
            onClick={() => applyDraft(jsonDraft)}
          >
            적용
          </FinixPrimaryButton>
        </div>
      ) : null}
    </div>
  );
}
