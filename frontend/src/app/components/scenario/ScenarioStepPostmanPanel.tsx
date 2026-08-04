import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, X } from "lucide-react";
import type { ScenarioResolvePreviewDto } from "@/api/types";
import {
  emptyStepBinding,
  type BindingInjectSpec,
  type BindingOverrideSpec,
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
  looksCompleteJsonText,
  tryParseBodyObject,
} from "@/lib/parseRequestBodyJson";
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
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";

const AUTO_APPLY_MS = 250;

type PanelTab = "input" | "output";

type BodyRevertSnapshot = {
  draft: string;
  injects: BindingInjectSpec[];
  overrides: BindingOverrideSpec[];
};

export type ScenarioStepPostmanPanelHandle = {
  /**
   * Sync pending Input body into bindings (e.g. before 임시저장).
   * Returns next bindings when a flush was needed.
   */
  flush: () =>
    | { ok: true; bindings?: StepBindingsByStepKey }
    | { ok: false };
};

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

export const ScenarioStepPostmanPanel = forwardRef<
  ScenarioStepPostmanPanelHandle,
  Props
>(function ScenarioStepPostmanPanel(
  {
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
  },
  ref,
) {
  const step = runSteps[stepIndex];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<PanelTab>("input");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [canRevert, setCanRevert] = useState(false);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revertSnapshotRef = useRef<BodyRevertSnapshot | null>(null);
  const prevStepKeyRef = useRef(step?.stepKey);

  const bindingsRef = useRef(bindings);
  const stepRef = useRef(step);
  const onBindingsChangeRef = useRef(onBindingsChange);
  bindingsRef.current = bindings;
  stepRef.current = step;
  onBindingsChangeRef.current = onBindingsChange;

  const cfg = step
    ? (bindings[step.stepKey] ?? emptyStepBinding())
    : emptyStepBinding();

  const previewRow = preview?.steps?.[stepIndex];
  const templateBody =
    previewRow?.template_request_body &&
    typeof previewRow.template_request_body === "object"
      ? (previewRow.template_request_body as Record<string, unknown>)
      : {};
  const templateBodyRef = useRef(templateBody);
  templateBodyRef.current = templateBody;

  const editorBody = useMemo(
    () => bodyForPostmanEditor(templateBody, cfg.overrides, cfg.injects),
    [templateBody, cfg.overrides, cfg.injects],
  );

  const availableVars = useMemo(
    () =>
      listAvailablePostmanVars(runSteps, bindings, startVarKeys, stepIndex),
    [runSteps, bindings, startVarKeys, stepIndex],
  );

  const captureRevertSnapshotIfNeeded = () => {
    // Keep the first snapshot for this edit streak (survives auto-apply).
    if (revertSnapshotRef.current) return;
    const currentStep = stepRef.current;
    if (!currentStep) return;
    const current = bindingsRef.current[currentStep.stepKey] ?? emptyStepBinding();
    revertSnapshotRef.current = {
      draft: JSON.stringify(
        bodyForPostmanEditor(
          templateBodyRef.current,
          current.overrides,
          current.injects,
        ),
        null,
        2,
      ),
      injects: current.injects.map((row) => ({ ...row })),
      overrides: current.overrides.map((row) => ({ ...row })),
    };
    setCanRevert(true);
  };

  const commitDraft = (
    draft: string,
  ): StepBindingsByStepKey | null => {
    const currentStep = stepRef.current;
    if (!currentStep) return bindingsRef.current;

    const parsed = tryParseBodyObject(draft);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return null;
    }

    const next = setStepPostmanBodyBindings(
      bindingsRef.current,
      currentStep.stepKey,
      parsePostmanBody(templateBodyRef.current, parsed.value),
    );
    onBindingsChangeRef.current(next);
    setJsonDirty(false);
    setJsonError(null);
    return next;
  };

  const revertDraft = () => {
    const currentStep = stepRef.current;
    const snap = revertSnapshotRef.current;
    if (!currentStep || !snap) return;

    clearApplyTimer();
    const prev = bindingsRef.current[currentStep.stepKey] ?? emptyStepBinding();
    const next: StepBindingsByStepKey = {
      ...bindingsRef.current,
      [currentStep.stepKey]: {
        extracts: prev.extracts,
        injects: snap.injects,
        overrides: snap.overrides,
      },
    };
    onBindingsChangeRef.current(next);
    setJsonDraft(snap.draft);
    setJsonDirty(false);
    setJsonError(null);
    revertSnapshotRef.current = null;
    setCanRevert(false);
  };

  const clearApplyTimer = () => {
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
  };

  const scheduleAutoApply = (draft: string) => {
    clearApplyTimer();
    applyTimerRef.current = setTimeout(() => {
      applyTimerRef.current = null;
      const parsed = tryParseBodyObject(draft);
      if (!parsed.ok) {
        // Incomplete text while typing — keep draft, no hard error yet.
        if (looksCompleteJsonText(draft)) {
          setJsonError(parsed.error);
        }
        return;
      }
      commitDraft(draft);
    }, AUTO_APPLY_MS);
  };

  useImperativeHandle(
    ref,
    () => ({
      flush: () => {
        clearApplyTimer();
        if (!jsonDirty) return { ok: true };
        const next = commitDraft(jsonDraft);
        if (!next) return { ok: false };
        return { ok: true, bindings: next };
      },
    }),
    [jsonDirty, jsonDraft],
  );

  useEffect(() => {
    return () => clearApplyTimer();
  }, []);

  useEffect(() => {
    clearApplyTimer();
    revertSnapshotRef.current = null;
    setCanRevert(false);
    setTab("input");
    setJsonDirty(false);
    setJsonError(null);
  }, [step?.stepKey]);

  useEffect(() => {
    const stepChanged = prevStepKeyRef.current !== step?.stepKey;
    prevStepKeyRef.current = step?.stepKey;

    if (jsonDirty) return;

    // Auto-apply updates bindings → editorBody; rewriting the textarea while
    // focused jumps scroll. Keep the live draft until blur / step change.
    if (
      !stepChanged &&
      textareaRef.current &&
      document.activeElement === textareaRef.current
    ) {
      setJsonError(null);
      return;
    }

    const box = textareaRef.current;
    const scrollTop = box?.scrollTop ?? 0;
    const selStart = box?.selectionStart ?? 0;
    const selEnd = box?.selectionEnd ?? 0;
    setJsonDraft(JSON.stringify(editorBody, null, 2));
    setJsonError(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.scrollTop = scrollTop;
      const max = el.value.length;
      el.setSelectionRange(Math.min(selStart, max), Math.min(selEnd, max));
    });
  }, [editorBody, jsonDirty, step?.stepKey]);

  if (!step) return null;

  const updateDraft = (next: string) => {
    captureRevertSnapshotIfNeeded();
    setJsonDraft(next);
    setJsonDirty(true);
    setJsonError(null);
    scheduleAutoApply(next);
  };

  const insertVar = (name: string) => {
    const token = `"${formatPostmanVar(name)}"`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? jsonDraft.length;
    const end = el?.selectionEnd ?? start;
    const scrollTop = el?.scrollTop ?? 0;
    const { next, cursor } = insertOrReplaceJsonStringValue(
      jsonDraft,
      start,
      end,
      token,
    );
    updateDraft(next);

    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.scrollTop = scrollTop;
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

      <div className="min-h-0 flex-1 flex flex-col overflow-hidden p-3">
        {tab === "input" ? (
          <>
            <div className="shrink-0 space-y-3">
              <ScenarioStepPostmanVarBar
                availableVars={availableVars}
                collectionVars={collectionVars}
                bodyText={jsonDraft}
                onInsertVar={insertVar}
                onAddCustomVar={onAddCustomVar}
                onRemoveCustomVar={onRemoveCustomVar}
              />
              {jsonError ? (
                <p className="text-[11px] text-destructive flex gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {jsonError}
                </p>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 mt-3 flex flex-col gap-2">
              {previewLoading && !previewRow ? (
                <FinixLoading inline label="불러오는 중…" />
              ) : (
                <textarea
                  ref={textareaRef}
                  className={cn(
                    "h-full min-h-0 w-full flex-1 resize-none rounded-sm border bg-background px-3 py-2 text-[11px] font-mono leading-relaxed",
                    jsonError ? "border-destructive" : "border-border",
                  )}
                  value={jsonDraft}
                  onChange={(e) => updateDraft(e.target.value)}
                  spellCheck={false}
                />
              )}
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canRevert}
                  className={cn(
                    "h-8 px-3 rounded-sm border text-[11px]",
                    canRevert
                      ? "border-border hover:bg-muted"
                      : "border-border text-muted-foreground cursor-not-allowed",
                  )}
                  onClick={revertDraft}
                >
                  되돌리기
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ScenarioStepPostmanTests
              step={step}
              bindings={bindings}
              onBindingsChange={onBindingsChange}
            />
          </div>
        )}
      </div>
    </div>
  );
});
