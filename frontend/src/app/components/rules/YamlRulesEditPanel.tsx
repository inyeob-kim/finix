import { useCallback, useEffect, useState } from "react";
import { AlignLeft, CheckCircle2, Copy, Download, Plus } from "lucide-react";
import { ApiError } from "@/api/client";
import { validateServiceRulesYaml } from "@/api/serviceRulesApi";
import {
  appendBlankRule,
  formatYamlRulesText,
  type YamlCaseType,
} from "@/lib/yamlRulesDocument";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import { YamlRulesCodeEditor } from "./YamlRulesCodeEditor";
import { YamlRulesFieldsForm } from "./YamlRulesFieldsForm";

type YamlEditSubTab = "source" | "fields";

type YamlRulesEditPanelProps = {
  serviceCode: string;
  yamlText: string;
  onYamlChange: (text: string) => void;
  disabled?: boolean;
  yamlCopyDone: boolean;
  onCopy: () => void;
  onExport: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string | null) => void;
  onFocusEditChange?: (focused: boolean) => void;
};

export function YamlRulesEditPanel({
  serviceCode,
  yamlText,
  onYamlChange,
  disabled = false,
  yamlCopyDone,
  onCopy,
  onExport,
  onNotice,
  onError,
  onFocusEditChange,
}: YamlRulesEditPanelProps) {
  const [subTab, setSubTab] = useState<YamlEditSubTab>("source");
  const [validating, setValidating] = useState(false);
  const [newRuleType, setNewRuleType] = useState<YamlCaseType>("E");
  const [expandRuleIndex, setExpandRuleIndex] = useState<number | null>(null);
  const [expandRuleToken, setExpandRuleToken] = useState(0);
  const [fieldsRuleEditing, setFieldsRuleEditing] = useState(false);

  const focusEdit = subTab === "fields" && fieldsRuleEditing;

  const handleFieldsEditingChange = useCallback(
    (editing: boolean) => {
      setFieldsRuleEditing(editing);
      onFocusEditChange?.(subTab === "fields" && editing);
    },
    [onFocusEditChange, subTab],
  );

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
      onError(result.error);
      return;
    }
    if (result.text) {
      onYamlChange(result.text);
      onNotice("YAML을 정리했습니다.");
      onError(null);
    }
  };

  const handleValidate = async () => {
    if (!serviceCode.trim()) return;
    setValidating(true);
    onError(null);
    try {
      const res = await validateServiceRulesYaml(serviceCode, yamlText);
      onNotice(
        `검증 통과 · 규칙 ${res.rule_count}개${res.service_name ? ` · ${res.service_name}` : ""}`,
      );
    } catch (e) {
      onError(
        e instanceof ApiError ? e.message : "YAML 검증에 실패했습니다.",
      );
    } finally {
      setValidating(false);
    }
  };

  const handleAddRule = () => {
    const result = appendBlankRule(yamlText, newRuleType, serviceCode);
    if (!result.ok || !result.text) {
      onError(result.ok ? "케이스 추가 실패" : result.error);
      return;
    }
    onYamlChange(result.text);
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
        <>
          <div className="rounded-sm border border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-[11px] text-muted-foreground space-y-1.5 shrink-0">
            <p>
              <span className="font-semibold text-orange-700 dark:text-orange-400">
                input
              </span>
              : 요청 본문 ·{" "}
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                expect
              </span>
              (E → error_code, N → validation_target) ·{" "}
              <span className="font-semibold text-violet-700 dark:text-violet-400">
                case_id / rule_type (E|N)
              </span>
              : 식별 · tags: input, business
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="inline-flex rounded-sm border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setSubTab("source")}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  subTab === "source"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                YAML 소스
              </button>
              <button
                type="button"
                onClick={() => setSubTab("fields")}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  subTab === "fields"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                입력/기대값
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
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
        </>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {subTab === "source" ? (
          <YamlRulesCodeEditor
            value={yamlText}
            onChange={onYamlChange}
            disabled={disabled}
            fillHeight
            className="h-full"
          />
        ) : (
          <YamlRulesFieldsForm
            yamlText={yamlText}
            onYamlChange={onYamlChange}
            disabled={disabled}
            expandRuleIndex={expandRuleIndex}
            expandRuleSignal={expandRuleToken}
            onRuleEditingChange={handleFieldsEditingChange}
          />
        )}
      </div>
    </div>
  );
}
