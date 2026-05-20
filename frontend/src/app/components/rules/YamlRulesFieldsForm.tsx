import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  applyRuleFieldUpdates,
  caseTypeLabel,
  duplicateRuleAtIndex,
  getCaseId,
  getRuleInput,
  normalizeCaseType,
  parseJsonObject,
  parseYamlRulesDocument,
  removeRuleAtIndex,
  setRulesOrder,
  tagsFromDraft,
  normalizeTagsFromRule,
  type YamlRuleRecord,
} from "@/lib/yamlRulesDocument";
import { YamlRuleSortableRow } from "./YamlRuleSortableRow";
import {
  YamlRuleFieldEditor,
  type RuleFieldDraft,
} from "./YamlRuleFieldEditor";
import { cn } from "../ui/utils";

type YamlRulesFieldsFormProps = {
  yamlText: string;
  onYamlChange: (text: string) => void;
  disabled?: boolean;
  expandRuleIndex?: number | null;
  expandRuleSignal?: number;
  onRuleEditingChange?: (editing: boolean) => void;
};

function formatJsonFieldForForm(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  if (Object.keys(value as Record<string, unknown>).length === 0) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function ruleToDraft(rule: YamlRuleRecord): RuleFieldDraft {
  const expect =
    rule.expect && typeof rule.expect === "object" && !Array.isArray(rule.expect)
      ? (rule.expect as Record<string, unknown>)
      : {};
  const tagFlags = normalizeTagsFromRule(rule);
  return {
    title: String(rule.title ?? ""),
    description: String(rule.description ?? ""),
    inputJson: formatJsonFieldForForm(getRuleInput(rule)),
    httpStatus: String(expect.http_status ?? ""),
    outcome: String(expect.outcome ?? ""),
    errorCode: String(expect.error_code ?? ""),
    validationTarget: String(expect.validation_target ?? ""),
    errorArgsJson: formatJsonFieldForForm(expect.error_args),
    tagInput: tagFlags.input,
    tagBusiness: tagFlags.business,
  };
}

function buildExpectFromDraft(draft: RuleFieldDraft, caseType: "E" | "N"): Record<string, unknown> {
  const expect: Record<string, unknown> = {};
  if (draft.httpStatus.trim()) {
    expect.http_status = Number.parseInt(draft.httpStatus.trim(), 10);
  }
  const outcome = draft.outcome.trim() || (caseType === "E" ? "error" : "success");
  expect.outcome = outcome;

  if (caseType === "E" || outcome === "error") {
    if (draft.errorCode.trim()) {
      expect.error_code = draft.errorCode.trim();
    }
    const args = parseJsonObject(draft.errorArgsJson, "error_args");
    if (!args.ok) throw new Error(args.error);
    if (Object.keys(args.value).length > 0) {
      expect.error_args = args.value;
    }
  } else if (draft.validationTarget.trim()) {
    expect.validation_target = draft.validationTarget.trim();
  }
  return expect;
}

function remapRecordKeys<T>(
  map: Record<number, T>,
  from: number,
  to: number,
): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [key, value] of Object.entries(map)) {
    let i = Number(key);
    if (i === from) {
      i = to;
    } else if (from < to) {
      if (i > from && i <= to) i -= 1;
    } else if (from > to) {
      if (i >= to && i < from) i += 1;
    }
    next[i] = value;
  }
  return next;
}

function remapDisplayIndex(current: number | null, from: number, to: number): number | null {
  if (current === null) return null;
  if (current === from) return to;
  if (from < to) {
    if (current > from && current <= to) return current - 1;
  } else if (from > to) {
    if (current >= to && current < from) return current + 1;
  }
  return current;
}

function mergeDraftIntoRule(
  rule: YamlRuleRecord,
  draft: RuleFieldDraft,
): YamlRuleRecord | { error: string; rule?: never } {
  const input = parseJsonObject(draft.inputJson, "input");
  if (!input.ok) return { error: input.error };
  const caseType = normalizeCaseType(String(rule.rule_type ?? ""));
  let expect: Record<string, unknown>;
  try {
    expect = buildExpectFromDraft(draft, caseType);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "expect 변환 실패",
    };
  }
  const tags = tagsFromDraft(draft.tagInput, draft.tagBusiness);
  if (tags.length === 0) {
    return { error: "tags는 input 또는 business 중 하나 이상 선택해야 합니다." };
  }
  return {
    ...rule,
    title: draft.title.trim(),
    description: draft.description.trim(),
    input: input.value,
    expect,
    tags,
    minimal_input: undefined,
    severity: undefined,
  };
}

export function YamlRulesFieldsForm({
  yamlText,
  onYamlChange,
  disabled = false,
  expandRuleIndex = null,
  expandRuleSignal = 0,
  onRuleEditingChange,
}: YamlRulesFieldsFormProps) {
  const parsed = useMemo(() => parseYamlRulesDocument(yamlText), [yamlText]);
  const rules = parsed.ok && Array.isArray(parsed.doc.rules) ? parsed.doc.rules : [];

  const [editingDisplayIndex, setEditingDisplayIndex] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, RuleFieldDraft>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState<{
    index: number;
    caseId: string;
    displayIndex: number;
  } | null>(null);
  const [displayOrder, setDisplayOrder] = useState<number[]>([]);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);

  const yamlRuleIndices = useMemo(
    () => rules.map((_, index) => index),
    [rules],
  );

  const orderedIndices =
    displayOrder.length === rules.length ? displayOrder : yamlRuleIndices;

  useEffect(() => {
    setDisplayOrder([]);
  }, [rules.length]);

  useEffect(() => {
    if (!parsed.ok) return;
    const next: Record<number, RuleFieldDraft> = {};
    orderedIndices.forEach((ruleIndex, displayIndex) => {
      const rule = rules[ruleIndex];
      if (rule && typeof rule === "object") {
        next[displayIndex] = ruleToDraft(rule as YamlRuleRecord);
      }
    });
    setDrafts(next);
    setFieldError(null);
  }, [yamlText, parsed.ok, rules.length, orderedIndices.join(",")]);

  useEffect(() => {
    if (editingDisplayIndex === null) return;
    if (editingDisplayIndex < 0 || editingDisplayIndex >= orderedIndices.length) {
      setEditingDisplayIndex(null);
      onRuleEditingChange?.(false);
    }
  }, [editingDisplayIndex, onRuleEditingChange, orderedIndices.length]);

  const setEditingState = useCallback(
    (displayIndex: number | null) => {
      if (displayIndex !== null) {
        if (listScrollRef.current) {
          listScrollTopRef.current = listScrollRef.current.scrollTop;
        }
        setEditingDisplayIndex(displayIndex);
        onRuleEditingChange?.(true);
        return;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setEditingDisplayIndex(null);
      onRuleEditingChange?.(false);
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = listScrollTopRef.current;
        }
      });
    },
    [onRuleEditingChange],
  );

  const moveRule = useCallback(
    (fromDisplay: number, toDisplay: number) => {
      setDisplayOrder((prev) => {
        const order = prev.length === rules.length ? [...prev] : rules.map((_, i) => i);
        const [moved] = order.splice(fromDisplay, 1);
        order.splice(toDisplay, 0, moved);
        return order;
      });
      setDrafts((prev) => remapRecordKeys(prev, fromDisplay, toDisplay));
      setEditingDisplayIndex((prev) => remapDisplayIndex(prev, fromDisplay, toDisplay));
    },
    [rules],
  );

  const commitDisplayOrder = useCallback(() => {
    if (displayOrder.length !== rules.length) return;
    if (displayOrder.every((ruleIndex, displayIndex) => ruleIndex === displayIndex)) {
      return;
    }
    const order = displayOrder;
    const reordered: YamlRuleRecord[] = [];
    for (let displayIndex = 0; displayIndex < order.length; displayIndex += 1) {
      const ruleIndex = order[displayIndex];
      const source = rules[ruleIndex];
      if (!source || typeof source !== "object") continue;
      const draft = drafts[displayIndex];
      if (draft) {
        const merged = mergeDraftIntoRule(source as YamlRuleRecord, draft);
        if ("error" in merged && typeof merged.error === "string") {
          setFieldError(merged.error);
          return;
        }
        reordered.push(merged as YamlRuleRecord);
      } else {
        reordered.push(source as YamlRuleRecord);
      }
    }
    const result = setRulesOrder(yamlText, reordered);
    if (!result.ok || !result.text) {
      setFieldError(result.ok ? "순서 저장 실패" : result.error);
      return;
    }
    setFieldError(null);
    onYamlChange(result.text);
    setDisplayOrder([]);
  }, [displayOrder, drafts, onYamlChange, rules, yamlText]);

  useEffect(() => {
    if (expandRuleIndex === null || expandRuleIndex < 0) return;
    const displayIndex = orderedIndices.indexOf(expandRuleIndex);
    if (displayIndex < 0) return;
    setEditingState(displayIndex);
  }, [expandRuleIndex, expandRuleSignal, orderedIndices.join(","), setEditingState]);

  const applyDraft = useCallback(
    (displayIndex: number, ruleIndex: number, draft: RuleFieldDraft, rule: YamlRuleRecord) => {
      const input = parseJsonObject(draft.inputJson, "input");
      if (!input.ok) {
        setFieldError(input.error);
        return;
      }
      const caseType = normalizeCaseType(String(rule.rule_type ?? ""));
      let expect: Record<string, unknown>;
      try {
        expect = buildExpectFromDraft(draft, caseType);
      } catch (e) {
        setFieldError(e instanceof Error ? e.message : "expect 변환 실패");
        return;
      }
      const tags = tagsFromDraft(draft.tagInput, draft.tagBusiness);
      if (tags.length === 0) {
        setFieldError("tags는 input 또는 business 중 하나 이상 선택해야 합니다.");
        return;
      }
      const result = applyRuleFieldUpdates(yamlText, [
        {
          index: ruleIndex,
          title: draft.title.trim(),
          description: draft.description.trim(),
          input: input.value,
          expect,
          tags,
        },
      ]);
      if (!result.ok || !result.text) {
        setFieldError(result.ok ? "YAML 갱신 실패" : result.error);
        return;
      }
      setFieldError(null);
      if (result.text !== yamlText) {
        onYamlChange(result.text);
      }
    },
    [onYamlChange, yamlText],
  );

  const applyCurrentEdit = useCallback(() => {
    if (editingDisplayIndex === null) return;
    const ruleIndex = orderedIndices[editingDisplayIndex];
    const rule = rules[ruleIndex];
    if (!rule || typeof rule !== "object") return;
    const draft = drafts[editingDisplayIndex];
    if (!draft) return;
    applyDraft(editingDisplayIndex, ruleIndex, draft, rule as YamlRuleRecord);
  }, [applyDraft, drafts, editingDisplayIndex, orderedIndices, rules]);

  const openEdit = useCallback(
    (displayIndex: number) => {
      if (editingDisplayIndex !== null && editingDisplayIndex !== displayIndex) {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
      setFieldError(null);
      setEditingState(displayIndex);
    },
    [editingDisplayIndex, setEditingState],
  );

  const closeEdit = useCallback(() => {
    setEditingState(null);
  }, [setEditingState]);

  const handleDuplicate = useCallback(
    (index: number) => {
      const result = duplicateRuleAtIndex(yamlText, index);
      if (!result.ok || !result.text) {
        setFieldError(result.ok ? "복제 실패" : result.error);
        return;
      }
      setFieldError(null);
      onYamlChange(result.text);
    },
    [onYamlChange, yamlText],
  );

  if (!parsed.ok) {
    return (
      <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-4 py-3">
        YAML을 먼저 수정하세요: {parsed.error}
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          rules 배열이 비어 있습니다. 상단에서 케이스 타입(E/N)을 선택하고 규칙
          추가를 누르거나, YAML 소스 탭에서 직접 작성하세요.
        </p>
        {fieldError ? (
          <p className="text-xs text-destructive">{fieldError}</p>
        ) : null}
      </div>
    );
  }

  const isEditing = editingDisplayIndex !== null;
  const editingRule =
    isEditing && editingDisplayIndex !== null
      ? (() => {
          const ruleIndex = orderedIndices[editingDisplayIndex];
          const rule = rules[ruleIndex];
          if (!rule || typeof rule !== "object") return null;
          return {
            ruleIndex,
            rule: rule as YamlRuleRecord,
            draft: drafts[editingDisplayIndex] ?? ruleToDraft(rule as YamlRuleRecord),
          };
        })()
      : null;

  return (
    <div className="relative flex flex-col min-h-0 h-full">
      <div
        className={cn(
          "flex flex-col min-h-0 h-full gap-3 transition-opacity duration-150",
          isEditing && "opacity-0 pointer-events-none",
        )}
        aria-hidden={isEditing}
      >
      <p className="text-xs text-muted-foreground leading-relaxed shrink-0">
        행을 클릭하면 편집 화면으로 이동합니다. title·description·{" "}
        <span className="font-semibold text-orange-700 dark:text-orange-400">
          input
        </span>
        ·{" "}
        <span className="font-semibold text-blue-700 dark:text-blue-400">expect</span>
        · tags를 수정합니다. 저장·검증은 YAML 소스 탭에서 하세요.
      </p>

      {fieldError ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-xs px-3 py-2 shrink-0">
          {fieldError}
        </div>
      ) : null}

      <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
      <DndProvider backend={HTML5Backend}>
        <div className="space-y-2">
          {orderedIndices.map((ruleIndex, displayIndex) => {
            const rule = rules[ruleIndex];
            if (!rule || typeof rule !== "object") return null;
            const r = rule as YamlRuleRecord;
            const draft = drafts[displayIndex] ?? ruleToDraft(r);
            const caseId = getCaseId(r) || `#${ruleIndex + 1}`;

            return (
              <YamlRuleSortableRow
                key={`${caseId}-${ruleIndex}`}
                displayIndex={displayIndex}
                moveRule={moveRule}
                onDragEnd={commitDisplayOrder}
                disabled={disabled}
              >
                {({ dragRef }) => (
                  <div className="rounded-sm border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-1 pr-2">
                      <div
                        ref={dragRef}
                        title="드래그로 순서 변경"
                        aria-label="드래그로 순서 변경"
                        className="pl-2 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <button
                        type="button"
                        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2.5 text-left hover:bg-muted/40 transition-colors"
                        onClick={() => openEdit(displayIndex)}
                        disabled={disabled}
                      >
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs text-primary">{caseId}</span>
                        <span className="text-xs text-muted-foreground">
                          {caseTypeLabel(r.rule_type)}
                        </span>
                        <span className="text-xs truncate flex-1">
                          {draft.title.trim() || (
                            <span className="text-muted-foreground italic">제목 없음</span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="이 규칙 복제"
                        aria-label="이 규칙 복제"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(ruleIndex);
                        }}
                        className="h-8 w-8 shrink-0 rounded-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="이 규칙 삭제"
                        aria-label="이 규칙 삭제"
                        disabled={disabled || rules.length <= 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletePending({
                            index: ruleIndex,
                            caseId,
                            displayIndex,
                          });
                        }}
                        className="h-8 w-8 shrink-0 rounded-sm border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center justify-center disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </YamlRuleSortableRow>
            );
          })}
        </div>
      </DndProvider>
      </div>
      </div>

      {isEditing && editingRule && editingDisplayIndex !== null ? (
        <div
          className="absolute inset-0 z-10 flex flex-col min-h-0 bg-background animate-in slide-in-from-right-4 fade-in duration-200"
          role="dialog"
          aria-label="규칙 필드 편집"
        >
          {(() => {
            const { rule: r, draft, ruleIndex } = editingRule;
            const caseId = getCaseId(r) || `#${ruleIndex + 1}`;
            const hasPrev = editingDisplayIndex > 0;
            const hasNext = editingDisplayIndex < orderedIndices.length - 1;
            return (
              <>
                <div className="flex flex-col gap-1.5 shrink-0 border-b border-border px-1 pb-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={disabled}
                      className="h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      목록으로
                    </button>
                    <span className="font-mono text-sm text-primary">{caseId}</span>
                    <span className="text-xs text-muted-foreground">
                      {caseTypeLabel(r.rule_type)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[min(20rem,40vw)]">
                      {draft.title.trim() || (
                        <span className="text-muted-foreground italic">제목 없음</span>
                      )}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        title="이전 규칙"
                        aria-label="이전 규칙"
                        disabled={disabled || !hasPrev}
                        onClick={() => openEdit(editingDisplayIndex - 1)}
                        className="h-8 w-8 rounded-sm border border-border text-muted-foreground hover:bg-muted inline-flex items-center justify-center disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] text-muted-foreground tabular-nums px-1">
                        {editingDisplayIndex + 1} / {orderedIndices.length}
                      </span>
                      <button
                        type="button"
                        title="다음 규칙"
                        aria-label="다음 규칙"
                        disabled={disabled || !hasNext}
                        onClick={() => openEdit(editingDisplayIndex + 1)}
                        className="h-8 w-8 rounded-sm border border-border text-muted-foreground hover:bg-muted inline-flex items-center justify-center disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {fieldError ? (
                  <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-xs px-3 py-2 shrink-0 mx-1 mt-2">
                    {fieldError}
                  </div>
                ) : null}
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-4 pb-2">
                  <YamlRuleFieldEditor
                    rule={r}
                    draft={draft}
                    disabled={disabled}
                    onDraftChange={(next) =>
                      setDrafts((prev) => ({ ...prev, [editingDisplayIndex]: next }))
                    }
                    onApply={applyCurrentEdit}
                  />
                </div>
              </>
            );
          })()}
        </div>
      ) : null}


      <AlertDialog
        open={deletePending !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePending(null);
        }}
      >
        <AlertDialogContent className="z-[100] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>규칙 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span>
                케이스{" "}
                <span className="font-mono font-medium text-foreground">
                  {deletePending?.caseId}
                </span>
                을(를) YAML에서 삭제할까요?
              </span>
              <span className="block text-xs">
                삭제 후 YAML 소스 탭에서 검증·저장하세요.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">취소</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (!deletePending) return;
                const { index } = deletePending;
                const result = removeRuleAtIndex(yamlText, index);
                if (!result.ok || !result.text) {
                  setFieldError(result.ok ? "삭제 실패" : result.error);
                  setDeletePending(null);
                  return;
                }
                setFieldError(null);
                onYamlChange(result.text);
                setDisplayOrder([]);
                setEditingState(null);
                setDeletePending(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

