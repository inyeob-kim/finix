import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  dumpYamlRule,
  parseYamlRule,
  parseYamlRulesDocument,
  replaceRuleAtIndex,
  type YamlRuleRecord,
} from "@/lib/yamlRulesDocument";
import {
  toYamlDiagnostic,
  type YamlDiagnostic,
} from "@/lib/yamlDiagnostic";
import { YamlEditorDiagnosticBar } from "./YamlEditorDiagnosticBar";
import { YamlRulesCaseSidebar } from "./YamlRulesCaseSidebar";
import {
  YamlRulesCodeEditor,
  type YamlRulesCodeEditorHandle,
} from "./YamlRulesCodeEditor";

type Selection =
  | { kind: "document" }
  | { kind: "rule"; index: number };

export type YamlRulesCaseSourceEditorHandle = {
  insertMacro: (macro: string) => void;
};

type YamlRulesCaseSourceEditorProps = {
  yamlText: string;
  onYamlChange: (text: string) => void;
  disabled?: boolean;
  externalDiagnostic?: YamlDiagnostic | null;
  onClearExternalDiagnostic?: () => void;
};

export const YamlRulesCaseSourceEditor = forwardRef<
  YamlRulesCaseSourceEditorHandle,
  YamlRulesCaseSourceEditorProps
>(function YamlRulesCaseSourceEditor(
  {
    yamlText,
    onYamlChange,
    disabled = false,
    externalDiagnostic = null,
    onClearExternalDiagnostic,
  },
  ref,
) {
  const parsed = useMemo(() => parseYamlRulesDocument(yamlText), [yamlText]);
  const rules = useMemo((): YamlRuleRecord[] => {
    if (!parsed.ok || !Array.isArray(parsed.doc.rules)) return [];
    return parsed.doc.rules as YamlRuleRecord[];
  }, [parsed]);

  const [selection, setSelection] = useState<Selection>(() =>
    rules.length > 0 ? { kind: "rule", index: 0 } : { kind: "document" },
  );
  const [caseDraft, setCaseDraft] = useState("");
  const [localDiagnostic, setLocalDiagnostic] = useState<YamlDiagnostic | null>(
    null,
  );
  const [jumpSignal, setJumpSignal] = useState(0);
  const [jumpLine, setJumpLine] = useState<number | null>(null);
  const skipCaseSyncRef = useRef(false);
  const prevRulesLenRef = useRef(rules.length);
  const editorRef = useRef<YamlRulesCodeEditorHandle>(null);
  const selectedRuleIndex = selection.kind === "rule" ? selection.index : -1;

  useImperativeHandle(ref, () => ({
    insertMacro(macro: string) {
      editorRef.current?.insertMacro(macro);
    },
  }));

  const selectDocument = () => {
    skipCaseSyncRef.current = false;
    setLocalDiagnostic(null);
    setSelection({ kind: "document" });
  };

  const selectRule = (index: number) => {
    skipCaseSyncRef.current = false;
    setLocalDiagnostic(null);
    setSelection({ kind: "rule", index });
  };

  useEffect(() => {
    const prevLen = prevRulesLenRef.current;
    prevRulesLenRef.current = rules.length;

    if (rules.length === 0) {
      setSelection({ kind: "document" });
      return;
    }

    // Modal often opens with empty yaml then loads — pick first case once rules appear.
    if (prevLen === 0 && rules.length > 0) {
      setSelection({ kind: "rule", index: 0 });
      return;
    }

    if (selectedRuleIndex >= rules.length) {
      setSelection({ kind: "rule", index: rules.length - 1 });
    }
  }, [rules.length, selectedRuleIndex]);

  useEffect(() => {
    if (selectedRuleIndex < 0) return;
    if (skipCaseSyncRef.current) {
      skipCaseSyncRef.current = false;
      return;
    }
    const rule = rules[selectedRuleIndex];
    if (!rule) {
      setCaseDraft("");
      setLocalDiagnostic(null);
      return;
    }
    setCaseDraft(dumpYamlRule(rule));
    setLocalDiagnostic(null);
  }, [yamlText, selectedRuleIndex, rules]);

  const handleCaseDraftChange = (text: string) => {
    setCaseDraft(text);
    onClearExternalDiagnostic?.();
    if (selectedRuleIndex < 0) return;

    const ruleParsed = parseYamlRule(text);
    if (!ruleParsed.ok) {
      const diag = toYamlDiagnostic(ruleParsed.error);
      setLocalDiagnostic(diag);
      setJumpLine(diag.line);
      return;
    }

    const replaced = replaceRuleAtIndex(
      yamlText,
      selectedRuleIndex,
      ruleParsed.rule,
    );
    if (!replaced.ok || !replaced.text) {
      setLocalDiagnostic(
        toYamlDiagnostic(replaced.ok ? "케이스 반영 실패" : replaced.error),
      );
      return;
    }

    setLocalDiagnostic(null);
    setJumpLine(null);
    skipCaseSyncRef.current = true;
    onYamlChange(replaced.text);
  };

  const handleDocumentChange = (text: string) => {
    onClearExternalDiagnostic?.();
    setLocalDiagnostic(null);
    setJumpLine(null);
    onYamlChange(text);
  };

  const activeDiagnostic =
    localDiagnostic ??
    (!parsed.ok ? toYamlDiagnostic(parsed.error) : null) ??
    externalDiagnostic;

  useEffect(() => {
    if (!externalDiagnostic) return;
    setJumpLine(externalDiagnostic.line);
    setJumpSignal((n) => n + 1);
  }, [externalDiagnostic]);

  const jumpToLine = (line: number) => {
    setJumpLine(line);
    setJumpSignal((n) => n + 1);
  };

  const dismissDiagnostic = () => {
    setLocalDiagnostic(null);
    setJumpLine(null);
    onClearExternalDiagnostic?.();
  };

  if (!parsed.ok) {
    const diag = toYamlDiagnostic(parsed.error);
    return (
      <div className="flex flex-col gap-2 min-h-0 h-full">
        <YamlEditorDiagnosticBar
          diagnostic={diag}
          onJumpToLine={diag.line ? jumpToLine : undefined}
        />
        <YamlRulesCodeEditor
          ref={editorRef}
          value={yamlText}
          onChange={handleDocumentChange}
          disabled={disabled}
          fillHeight
          className="h-full"
          errorLine={jumpLine ?? diag.line}
          errorLineSignal={jumpSignal}
        />
      </div>
    );
  }

  const editingDocument = selection.kind === "document";
  const selectedRule =
    selectedRuleIndex >= 0 ? rules[selectedRuleIndex] : undefined;
  const editorErrorLine = jumpLine ?? activeDiagnostic?.line ?? null;

  return (
    <div className="flex flex-col sm:flex-row gap-3 min-h-0 h-full">
      <YamlRulesCaseSidebar
        rules={rules}
        disabled={disabled}
        editingDocument={editingDocument}
        selectedRuleIndex={selectedRuleIndex}
        caseHasLocalError={localDiagnostic != null && !editingDocument}
        onSelectDocument={selectDocument}
        onSelectRule={selectRule}
      />

      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {activeDiagnostic ? (
          <YamlEditorDiagnosticBar
            diagnostic={activeDiagnostic}
            onJumpToLine={activeDiagnostic.line ? jumpToLine : undefined}
            onDismiss={dismissDiagnostic}
          />
        ) : null}
        <YamlRulesCodeEditor
          ref={editorRef}
          value={editingDocument ? yamlText : caseDraft}
          onChange={
            editingDocument ? handleDocumentChange : handleCaseDraftChange
          }
          disabled={disabled || (!editingDocument && !selectedRule)}
          fillHeight
          className="h-full"
          errorLine={editorErrorLine}
          errorLineSignal={jumpSignal}
        />
      </div>
    </div>
  );
});
