import { useCallback, useEffect, useRef, useState } from "react";
import type { ServiceRuleCaseMetaDto } from "@/api/types";
import { AlignLeft, CheckCircle2, Copy, Download, Plus } from "lucide-react";
import { ApiError } from "@/api/client";
import { validateServiceRulesYaml } from "@/api/serviceRulesApi";
import {
  appendBlankRule,
  formatYamlRulesText,
  type YamlCaseType,
} from "@/lib/yamlRulesDocument";
import { toYamlDiagnostic, type YamlDiagnostic } from "@/lib/yamlDiagnostic";
import { FINIX_YAML_MACRO_RAIL_WIDTH } from "@/lib/finixModalLayout";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import { YamlInputMacroPanel } from "./YamlInputMacroPanel";
import { YamlInputMacroToggle } from "./YamlInputMacroToggle";
import {
  YamlRulesCaseSourceEditor,
  type YamlRulesCaseSourceEditorHandle,
} from "./YamlRulesCaseSourceEditor";
import { YamlRulesFieldsForm } from "./YamlRulesFieldsForm";

type YamlEditSubTab = "source" | "fields";

type YamlRulesEditPanelProps = {
  serviceCode: string;
  yamlText: string;
  onYamlChange: (text: string) => void;
  disabled?: boolean;
  runningCaseId?: string | null;
  yamlCopyDone: boolean;
  onCopy: () => void;
  onExport: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string | null) => void;
  onFocusEditChange?: (focused: boolean) => void;
  onRunCase?: (caseId: string, ruleIndex: number) => void;
  caseMetaById?: Record<string, ServiceRuleCaseMetaDto>;
  applyNeedsSave?: boolean;
  materializingCaseId?: string | null;
  onMaterializeCase?: (caseId: string) => void;
  togglingCaseId?: string | null;
  onToggleCaseApplied?: (caseId: string) => void;
};

export function YamlRulesEditPanel({
  serviceCode,
  yamlText,
  onYamlChange,
  disabled = false,
  runningCaseId = null,
  yamlCopyDone,
  onCopy,
  onExport,
  onNotice,
  onError,
  onFocusEditChange,
  onRunCase,
  caseMetaById,
  applyNeedsSave = false,
  materializingCaseId = null,
  onMaterializeCase,
  togglingCaseId = null,
  onToggleCaseApplied,
}: YamlRulesEditPanelProps) {
  const [subTab, setSubTab] = useState<YamlEditSubTab>("source");
  const [validating, setValidating] = useState(false);
  const [newRuleType, setNewRuleType] = useState<YamlCaseType>("E");
  const [expandRuleIndex, setExpandRuleIndex] = useState<number | null>(null);
  const [expandRuleToken, setExpandRuleToken] = useState(0);
  const [fieldsRuleEditing, setFieldsRuleEditing] = useState(false);
  const [macroPanelOpen, setMacroPanelOpen] = useState(false);
  const [sourceDiagnostic, setSourceDiagnostic] =
    useState<YamlDiagnostic | null>(null);
  const sourceEditorRef = useRef<YamlRulesCaseSourceEditorHandle>(null);
  const fieldsMacroInsertRef = useRef<((macro: string) => void) | null>(null);

  const focusEdit = subTab === "fields" && fieldsRuleEditing;

  const setMacroOpen = useCallback((open: boolean) => {
    setMacroPanelOpen(open);
  }, []);

  const toggleMacroPanel = useCallback(() => {
    setMacroOpen(!macroPanelOpen);
  }, [macroPanelOpen, setMacroOpen]);

  const handleFieldsEditingChange = useCallback(
    (editing: boolean) => {
      setFieldsRuleEditing(editing);
      onFocusEditChange?.(subTab === "fields" && editing);
      if (!editing) {
        fieldsMacroInsertRef.current = null;
      }
    },
    [onFocusEditChange, subTab],
  );

  const registerFieldsMacroInsert = useCallback(
    (insert: ((macro: string) => void) | null) => {
      fieldsMacroInsertRef.current = insert;
    },
    [],
  );

  const applyMacro = useCallback(
    (macro: string) => {
      if (subTab === "source") {
        sourceEditorRef.current?.insertMacro(macro);
        return;
      }
      if (fieldsMacroInsertRef.current) {
        fieldsMacroInsertRef.current(macro);
        return;
      }
      onNotice("케이스를 열어 input에 커서를 둔 뒤 동적값을 넣으세요.");
    },
    [onNotice, subTab],
  );

  const macroHelperText =
    subTab === "source"
      ? '커서가 있는 값(따옴표 포함)을 "{{$…}}" 형식으로 바꿉니다. YAML에 즉시 반영됩니다.'
      : fieldsRuleEditing
        ? "커서가 있는 JSON 문자열 값을 매크로로 바꿉니다. 실행 시 실제 값으로 해석됩니다."
        : "케이스를 열어 input에 커서를 둔 뒤 적용하세요.";

  const macroApplyLabel = "값 반영";
  useEffect(() => {
    return () => onFocusEditChange?.(false);
  }, [onFocusEditChange]);

  useEffect(() => {
    if (expandRuleIndex === null) return;
    const timer = window.setTimeout(() => setExpandRuleIndex(null), 0);
    return () => window.clearTimeout(timer);
  }, [expandRuleIndex, expandRuleToken]);

  const handleFormat = () => {
    const result = formatYamlRulesText(yamlText);
    if (!result.ok) {
      setSubTab("source");
      setSourceDiagnostic(toYamlDiagnostic(result.error));
      onError(null);
      return;
    }
    if (result.text) {
      onYamlChange(result.text);
      onNotice("YAML을 정리했습니다.");
      setSourceDiagnostic(null);
      onError(null);
    }
  };

  const handleValidate = async () => {
    if (!serviceCode.trim()) return;
    setValidating(true);
    onError(null);
    setSourceDiagnostic(null);
    try {
      const res = await validateServiceRulesYaml(serviceCode, yamlText);
      onNotice(
        `검증 통과 · 규칙 ${res.rule_count}개${res.service_name ? ` · ${res.service_name}` : ""}`,
      );
    } catch (e) {
      const raw =
        e instanceof ApiError ? e.message : "YAML 검증에 실패했습니다.";
      setSubTab("source");
      setSourceDiagnostic(toYamlDiagnostic(raw));
    } finally {
      setValidating(false);
    }
  };

  const handleAddRule = () => {
    const result = appendBlankRule(yamlText, newRuleType, serviceCode);
    if (!result.ok || !result.text) {
      setSubTab("source");
      setSourceDiagnostic(
        toYamlDiagnostic(result.ok ? "케이스 추가 실패" : result.error),
      );
      onError(null);
      return;
    }
    onYamlChange(result.text);
    setSourceDiagnostic(null);
    onError(null);
    setSubTab("fields");
    onNotice(
      `${newRuleType === "E" ? "Error" : "Normal"} 케이스를 추가했습니다. YAML 소스 탭에서 검증·저장하세요.`,
    );
    if (typeof result.newIndex === "number") {
      setExpandRuleIndex(result.newIndex);
      setExpandRuleToken((n) => n + 1);
    }
  };

  const caseTypeChipClass = (type: YamlCaseType) =>
    `px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
      newRuleType === type
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 h-full",
        focusEdit ? "gap-0" : "gap-3",
      )}
    >
      {!focusEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex gap-1 rounded-sm border border-border p-0.5">
            {(
              [
                { id: "source" as const, label: "YAML 소스" },
                { id: "fields" as const, label: "입력/기대값" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={cn(
                  "h-8 px-3 text-xs rounded-sm",
                  subTab === t.id
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <YamlInputMacroToggle
              disabled={disabled}
              active={macroPanelOpen}
              onClick={toggleMacroPanel}
            />
            {subTab === "source" ? (
              <>
                <button
                  type="button"
                  onClick={handleFormat}
                  disabled={disabled || !yamlText.trim()}
                  className="h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  포맷
                </button>
                <button
                  type="button"
                  onClick={() => void handleValidate()}
                  disabled={disabled || validating || !yamlText.trim()}
                  className="h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {validating ? (
                    <FinixLoading size="sm" inline />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  검증
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={disabled || !yamlText.trim()}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title={yamlCopyDone ? "복사됨" : "YAML 복사"}
                >
                  {yamlCopyDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <FinixPrimaryButton
                  onClick={onExport}
                  className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </FinixPrimaryButton>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  추가할 타입
                </span>
                <div
                  className="inline-flex rounded-sm border border-border bg-muted/30 p-0.5"
                  role="group"
                  aria-label="추가할 케이스 타입"
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setNewRuleType("E")}
                    className={caseTypeChipClass("E")}
                  >
                    Error (E)
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setNewRuleType("N")}
                    className={caseTypeChipClass("N")}
                  >
                    Normal (N)
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={disabled}
                  className="h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  케이스 추가
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {subTab === "source" ? (
            <YamlRulesCaseSourceEditor
              ref={sourceEditorRef}
              yamlText={yamlText}
              onYamlChange={(text) => {
                setSourceDiagnostic(null);
                onYamlChange(text);
              }}
              disabled={disabled}
              runningCaseId={runningCaseId}
              externalDiagnostic={sourceDiagnostic}
              onClearExternalDiagnostic={() => setSourceDiagnostic(null)}
              onRunCase={onRunCase}
              caseMetaById={caseMetaById}
              applyNeedsSave={applyNeedsSave}
              materializingCaseId={materializingCaseId}
              onMaterializeCase={onMaterializeCase}
              togglingCaseId={togglingCaseId}
              onToggleCaseApplied={onToggleCaseApplied}
            />
          ) : (
            <YamlRulesFieldsForm
              yamlText={yamlText}
              onYamlChange={onYamlChange}
              disabled={disabled}
              expandRuleIndex={expandRuleIndex}
              expandRuleSignal={expandRuleToken}
              onRuleEditingChange={handleFieldsEditingChange}
              onRegisterMacroInsert={registerFieldsMacroInsert}
              macroPanelOpen={macroPanelOpen}
              onToggleMacroPanel={toggleMacroPanel}
              caseMetaById={caseMetaById}
              applyNeedsSave={applyNeedsSave}
              materializingCaseId={materializingCaseId}
              onMaterializeCase={onMaterializeCase}
              togglingCaseId={togglingCaseId}
              onToggleCaseApplied={onToggleCaseApplied}
            />
          )}
        </div>

        {macroPanelOpen ? (
          <div
            className={cn(
              "flex h-full min-h-0 flex-col border-l border-border",
              FINIX_YAML_MACRO_RAIL_WIDTH,
            )}
          >
            <YamlInputMacroPanel
              disabled={disabled}
              applyLabel={macroApplyLabel}
              helperText={macroHelperText}
              onApplyMacro={applyMacro}
              onClose={() => setMacroOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
