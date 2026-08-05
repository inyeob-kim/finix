import { useState } from "react";
import { CircleHelp, X } from "lucide-react";
import {
  DynamicGeneratorSourcePanel,
  type DynamicGeneratorSelection,
} from "../dynamicValue/DynamicGeneratorSourcePanel";
import { FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";
import {
  datePresetToYamlMacro,
  generatorKeyToYamlMacro,
  type YamlMacroKind,
} from "@/lib/yamlInputMacros";

type Props = {
  disabled?: boolean;
  applyLabel?: string;
  /** Shown on hover only (header help + apply button). */
  helperText?: string;
  onApplyMacro: (macro: string) => void;
  onClose: () => void;
};

const KIND_TABS: Array<{ id: YamlMacroKind; label: string }> = [
  { id: "generator", label: "Generator" },
  { id: "date", label: "Date" },
];

const DATE_CHIPS: Array<{
  id: "today" | "addDays" | "addMonths" | "addYears";
  label: string;
  arg?: number;
}> = [
  { id: "today", label: "오늘" },
  { id: "addDays", label: "내일", arg: 1 },
  { id: "addMonths", label: "1개월 후", arg: 1 },
  { id: "addYears", label: "1년 후", arg: 1 },
];

export function YamlInputMacroPanel({
  disabled = false,
  applyLabel = "값 반영",
  helperText = "선택한 값을 매크로로 바꿉니다. 실행 시 실제 값으로 해석됩니다.",
  onApplyMacro,
  onClose,
}: Props) {
  const [kind, setKind] = useState<YamlMacroKind>("generator");
  const [selection, setSelection] = useState<DynamicGeneratorSelection | null>(
    null,
  );
  const [datePreset, setDatePreset] = useState<
    "today" | "addDays" | "addMonths" | "addYears"
  >("today");
  const [dateArg, setDateArg] = useState("1");

  const previewMacro =
    kind === "generator"
      ? generatorKeyToYamlMacro(
          selection?.mode && selection.mode !== "literal"
            ? selection.mode
            : "today_yyyymmdd",
          selection?.namePart ?? "full",
        )
      : datePresetToYamlMacro(datePreset, Number.parseInt(dateArg, 10) || 1);

  const onConfirm = () => {
    if (kind === "generator") {
      if (!selection || selection.aiActive) return;
      if (!selection.mode || selection.mode === "literal") return;
      onApplyMacro(
        generatorKeyToYamlMacro(selection.mode, selection.namePart),
      );
      return;
    }
    const n = Number.parseInt(dateArg, 10);
    onApplyMacro(datePresetToYamlMacro(datePreset, Number.isFinite(n) ? n : 1));
  };

  const applyTitle =
    kind === "generator" && selection?.aiActive
      ? "AI로 만든 뒤 목록에서 선택하거나 저장하세요"
      : `${helperText}\n→ ${previewMacro}`;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-muted/10">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <p className="text-xs font-medium text-foreground">동적값</p>
          <span
            className="inline-flex size-5 items-center justify-center text-muted-foreground"
            title={helperText}
            aria-label={helperText}
          >
            <CircleHelp className="size-3.5" />
          </span>
        </div>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClose}
          title="패널 닫기"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className="flex shrink-0 gap-1 rounded-sm border border-border p-0.5 bg-muted/30">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "flex-1 h-7 text-[11px] rounded-sm",
                kind === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setKind(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {kind === "generator" ? (
          <DynamicGeneratorSourcePanel
            disabled={disabled}
            title="생성기 선택"
            includeLiteral={false}
            autoFocusSearch
            className="min-h-0 flex-1 border-0 bg-transparent"
            initialMode="today_yyyymmdd"
            onSelectionChange={setSelection}
          />
        ) : null}

        {kind === "date" ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <div className="flex flex-wrap gap-1">
              {DATE_CHIPS.map((chip) => (
                <button
                  key={chip.id + String(chip.arg ?? "")}
                  type="button"
                  className={cn(
                    "h-7 px-2 rounded-sm border text-[11px]",
                    datePreset === chip.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setDatePreset(chip.id);
                    if (chip.arg != null) setDateArg(String(chip.arg));
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {datePreset !== "today" ? (
              <FinixUnderlineInput
                value={dateArg}
                onChange={(e) => setDateArg(e.target.value)}
                placeholder="오프셋 (예: 1)"
                className="font-mono text-xs"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-border/60 p-3">
        <button
          type="button"
          className="h-9 w-full rounded-sm bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          disabled={
            disabled ||
            (kind === "generator" && (!!selection?.aiActive || !selection?.mode))
          }
          title={applyTitle}
          onClick={onConfirm}
        >
          {applyLabel}
        </button>
      </div>
    </aside>
  );
}
