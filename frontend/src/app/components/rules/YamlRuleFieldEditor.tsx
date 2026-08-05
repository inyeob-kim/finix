import { useCallback, useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { FinixField, FinixUnderlineInput, FinixUnderlineSelect } from "../ui/finix-form";
import type { YamlRuleRecord } from "@/lib/yamlRulesDocument";
import { getCaseId, normalizeCaseType } from "@/lib/yamlRulesDocument";
import { insertOrReplaceJsonStringValue } from "@/lib/jsonStringReplace";
import { YamlInputMacroToggle } from "./YamlInputMacroToggle";

export type RuleFieldDraft = {
  title: string;
  description: string;
  inputJson: string;
  httpStatus: string;
  outcome: string;
  errorCode: string;
  validationTarget: string;
  errorArgsJson: string;
  tagInput: boolean;
  tagBusiness: boolean;
};

type YamlRuleFieldEditorProps = {
  rule: YamlRuleRecord;
  draft: RuleFieldDraft;
  disabled?: boolean;
  onDraftChange: (draft: RuleFieldDraft) => void;
  onApply: () => void;
  /** Register insert callback for the parent macro side panel. */
  onRegisterMacroInsert?: (insert: ((macro: string) => void) | null) => void;
  macroPanelOpen?: boolean;
  onToggleMacroPanel?: () => void;
};

const INPUT_UNDO_LIMIT = 50;
const INPUT_UNDO_COALESCE_MS = 600;

export function YamlRuleFieldEditor({
  rule,
  draft,
  disabled = false,
  onDraftChange,
  onApply,
  onRegisterMacroInsert,
  macroPanelOpen = false,
  onToggleMacroPanel,
}: YamlRuleFieldEditorProps) {
  const caseType = normalizeCaseType(String(rule.rule_type ?? ""));
  const showErrorFields =
    caseType === "E" || draft.outcome === "error" || !draft.outcome;
  const showNormalFields = caseType === "N" || draft.outcome === "success";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputUndoStackRef = useRef<string[]>([]);
  const inputJsonRef = useRef(draft.inputJson);
  const applyingUndoRef = useRef(false);
  const lastUndoPushAtRef = useRef(0);
  const [canUndoInput, setCanUndoInput] = useState(false);
  const caseKey = getCaseId(rule);

  useEffect(() => {
    inputJsonRef.current = draft.inputJson;
  }, [draft.inputJson]);

  useEffect(() => {
    inputUndoStackRef.current = [];
    lastUndoPushAtRef.current = 0;
    setCanUndoInput(false);
  }, [caseKey]);

  const setInputJson = useCallback(
    (next: string, forceUndoPoint = false) => {
      const prev = inputJsonRef.current;
      if (next === prev) return;
      if (!applyingUndoRef.current) {
        const now = Date.now();
        const stack = inputUndoStackRef.current;
        const coalesce =
          !forceUndoPoint &&
          stack.length > 0 &&
          now - lastUndoPushAtRef.current < INPUT_UNDO_COALESCE_MS;
        if (!coalesce) {
          stack.push(prev);
          if (stack.length > INPUT_UNDO_LIMIT) stack.shift();
          setCanUndoInput(true);
        }
        lastUndoPushAtRef.current = now;
      }
      inputJsonRef.current = next;
      onDraftChange({ ...draft, inputJson: next });
    },
    [draft, onDraftChange],
  );

  const undoInput = useCallback(() => {
    const prev = inputUndoStackRef.current.pop();
    if (prev == null) return;
    applyingUndoRef.current = true;
    lastUndoPushAtRef.current = 0;
    inputJsonRef.current = prev;
    onDraftChange({ ...draft, inputJson: prev });
    setCanUndoInput(inputUndoStackRef.current.length > 0);
    requestAnimationFrame(() => {
      applyingUndoRef.current = false;
      inputRef.current?.focus();
    });
  }, [draft, onDraftChange]);

  const insertMacro = useCallback(
    (macro: string) => {
      const el = inputRef.current;
      const value = inputJsonRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? start;
      const scrollTop = el?.scrollTop ?? 0;
      const quoted = JSON.stringify(macro);
      const { next, cursor } = insertOrReplaceJsonStringValue(
        value,
        start,
        end,
        quoted,
      );
      setInputJson(next, true);
      requestAnimationFrame(() => {
        const ta = inputRef.current;
        if (!ta) return;
        ta.focus();
        ta.scrollTop = scrollTop;
        ta.setSelectionRange(cursor, cursor);
      });
    },
    [setInputJson],
  );

  useEffect(() => {
    if (!onRegisterMacroInsert) return;
    onRegisterMacroInsert(insertMacro);
    return () => onRegisterMacroInsert(null);
  }, [insertMacro, onRegisterMacroInsert]);

  return (
    <div className="space-y-4 pb-2 pt-1">
      <div className="space-y-4">
        <FinixField label="title">
          <FinixUnderlineInput
            value={draft.title}
            onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            onBlur={onApply}
            disabled={disabled}
            placeholder="케이스 제목"
          />
        </FinixField>
        <FinixField label="description">
          <FinixUnderlineInput
            value={draft.description}
            onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
            onBlur={onApply}
            disabled={disabled}
            placeholder="케이스 설명"
          />
        </FinixField>
      </div>

      <FinixField
        label="input (JSON)"
        helperText="테스트케이스 request_body로 사용됩니다 · 변경은 Ctrl+Z / 되돌리기로 취소"
      >
        <div className="flex items-center justify-end gap-1.5 mb-1.5">
          <button
            type="button"
            disabled={disabled || !canUndoInput}
            title="input 변경 되돌리기 (Ctrl+Z)"
            className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-sm border border-border text-xs font-medium bg-background hover:bg-muted disabled:opacity-40"
            onClick={undoInput}
          >
            <Undo2 className="size-3.5" />
            되돌리기
          </button>
          {onToggleMacroPanel ? (
            <YamlInputMacroToggle
              disabled={disabled}
              active={macroPanelOpen}
              onClick={onToggleMacroPanel}
            />
          ) : null}
        </div>
        <textarea
          ref={inputRef}
          placeholder={'{\n  "fieldName": "value"\n}'}
          value={draft.inputJson}
          onChange={(e) => setInputJson(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
              if (inputUndoStackRef.current.length === 0) return;
              e.preventDefault();
              undoInput();
            }
          }}
          onBlur={onApply}
          disabled={disabled}
          spellCheck={false}
          rows={18}
          className="w-full min-h-[16rem] sm:min-h-[18rem] font-mono text-xs bg-background border border-border rounded-sm p-3 outline-none focus:ring-2 focus:ring-primary/25"
        />
      </FinixField>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.tagInput}
            disabled={disabled}
            onChange={(e) => onDraftChange({ ...draft, tagInput: e.target.checked })}
            onBlur={onApply}
          />
          tag: input
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.tagBusiness}
            disabled={disabled}
            onChange={(e) => onDraftChange({ ...draft, tagBusiness: e.target.checked })}
            onBlur={onApply}
          />
          tag: business
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FinixField label="expect.http_status">
          <FinixUnderlineInput
            value={draft.httpStatus}
            onChange={(e) => onDraftChange({ ...draft, httpStatus: e.target.value })}
            onBlur={onApply}
            disabled={disabled}
            placeholder={showErrorFields ? "400" : "200"}
          />
        </FinixField>
        <FinixField label="expect.outcome">
          <FinixUnderlineSelect
            value={draft.outcome}
            onChange={(e) => onDraftChange({ ...draft, outcome: e.target.value })}
            onBlur={onApply}
            disabled={disabled}
          >
            <option value="">—</option>
            <option value="success">success</option>
            <option value="error">error</option>
          </FinixUnderlineSelect>
        </FinixField>
        {showErrorFields ? (
          <div className="sm:col-span-2">
            <FinixField label="expect.error_code" helperText="Error 케이스(E) 필수">
              <FinixUnderlineInput
                value={draft.errorCode}
                onChange={(e) => onDraftChange({ ...draft, errorCode: e.target.value })}
                onBlur={onApply}
                disabled={disabled}
                placeholder="AAPARE0001"
                className="font-mono"
              />
            </FinixField>
          </div>
        ) : null}
        {showNormalFields ? (
          <div className="sm:col-span-2">
            <FinixField
              label="expect.validation_target"
              helperText="Normal 케이스(N) — 성공 시 검증할 응답 동작"
            >
              <FinixUnderlineInput
                value={draft.validationTarget}
                onChange={(e) =>
                  onDraftChange({ ...draft, validationTarget: e.target.value })
                }
                onBlur={onApply}
                disabled={disabled}
                placeholder="transaction date/time fields are populated"
              />
            </FinixField>
          </div>
        ) : null}
      </div>

      {showErrorFields ? (
        <FinixField label="expect.error_args (JSON, 선택)" helperText="없으면 비워 두세요">
          <textarea
            placeholder="{}"
            value={draft.errorArgsJson}
            onChange={(e) => onDraftChange({ ...draft, errorArgsJson: e.target.value })}
            onBlur={onApply}
            disabled={disabled}
            spellCheck={false}
            rows={4}
            className="w-full font-mono text-xs bg-background border border-border rounded-sm p-3 outline-none focus:ring-2 focus:ring-primary/25"
          />
        </FinixField>
      ) : null}

      <button
        type="button"
        className="text-xs text-primary hover:underline disabled:opacity-50"
        disabled={disabled}
        onClick={onApply}
      >
        이 규칙 반영
      </button>
    </div>
  );
}
