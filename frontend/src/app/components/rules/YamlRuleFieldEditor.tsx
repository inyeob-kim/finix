import { FinixField, FinixUnderlineInput, FinixUnderlineSelect } from "../ui/finix-form";
import type { YamlRuleRecord } from "@/lib/yamlRulesDocument";
import { normalizeCaseType } from "@/lib/yamlRulesDocument";

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
};

export function YamlRuleFieldEditor({
  rule,
  draft,
  disabled = false,
  onDraftChange,
  onApply,
}: YamlRuleFieldEditorProps) {
  const caseType = normalizeCaseType(String(rule.rule_type ?? ""));
  const showErrorFields =
    caseType === "E" || draft.outcome === "error" || !draft.outcome;
  const showNormalFields = caseType === "N" || draft.outcome === "success";

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
        helperText="테스트케이스 request_body로 사용됩니다"
      >
        <textarea
          placeholder={'{\n  "fieldName": "value"\n}'}
          value={draft.inputJson}
          onChange={(e) => onDraftChange({ ...draft, inputJson: e.target.value })}
          onBlur={onApply}
          disabled={disabled}
          spellCheck={false}
          rows={10}
          className="w-full font-mono text-xs bg-background border border-border rounded-sm p-3 outline-none focus:ring-2 focus:ring-primary/25"
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
