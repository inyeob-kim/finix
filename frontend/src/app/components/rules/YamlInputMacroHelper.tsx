import { useEffect, useRef, useState, type RefObject } from "react";
import { Sparkles } from "lucide-react";
import {
  listCollectionVarGenerators,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import { CollectionVarGeneratorPicker } from "../scenario/CollectionVarGeneratorPicker";
import { FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";
import {
  datePresetToYamlMacro,
  generatorKeyToYamlMacro,
  type YamlMacroKind,
} from "@/lib/yamlInputMacros";
import { insertOrReplaceJsonStringValue } from "@/lib/jsonStringReplace";
import { YamlMacroAiCreatePanel } from "./YamlMacroAiCreatePanel";

type Props = {
  disabled?: boolean;
  /** JSON textarea mode (입력/기대값). */
  value?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onInsert?: (nextJson: string) => void;
  /** YAML source mode: apply macro immediately via editor callback. */
  onApplyMacro?: (macro: string) => void;
  applyLabel?: string;
  helperText?: string;
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

export function YamlInputMacroHelper({
  disabled = false,
  value = "",
  textareaRef,
  onInsert,
  onApplyMacro,
  applyLabel = "필드 값에 넣기",
  helperText = "커서가 있는 JSON 문자열 값을 매크로로 바꿉니다. 실행 시 실제 값으로 해석됩니다.",
}: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<YamlMacroKind>("generator");
  const [catalog, setCatalog] = useState<CollectionVarGeneratorDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [generatorKey, setGeneratorKey] = useState("today_yyyymmdd");
  const [datePreset, setDatePreset] = useState<
    "today" | "addDays" | "addMonths" | "addYears"
  >("today");
  const [dateArg, setDateArg] = useState("1");
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const reloadCatalog = async () => {
    setCatalogLoading(true);
    try {
      setCatalog(await listCollectionVarGenerators());
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void reloadCatalog();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t || !panelRef.current) return;
      if (panelRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const applyMacro = (macro: string) => {
    if (onApplyMacro) {
      onApplyMacro(macro);
      setOpen(false);
      return;
    }
    const el = textareaRef?.current;
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
    onInsert?.(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const ta = textareaRef?.current;
      if (!ta) return;
      ta.focus();
      ta.scrollTop = scrollTop;
      ta.setSelectionRange(cursor, cursor);
    });
  };

  const onConfirm = () => {
    if (kind === "generator") {
      if (aiMode || !generatorKey.trim()) return;
      applyMacro(generatorKeyToYamlMacro(generatorKey));
      return;
    }
    const n = Number.parseInt(dateArg, 10);
    applyMacro(datePresetToYamlMacro(datePreset, Number.isFinite(n) ? n : 1));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-sm border border-border",
          "text-xs font-medium bg-background hover:bg-muted disabled:opacity-50",
        )}
      >
        <Sparkles className="size-3.5 text-primary" />
        동적값
      </button>

      {open ? (
        <div className="absolute z-30 right-0 mt-1 w-[min(24rem,calc(100vw-2rem))] rounded-sm border border-border bg-background shadow-md p-3 space-y-3">
          <div className="flex gap-1 rounded-sm border border-border p-0.5 bg-muted/30">
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
                onClick={() => {
                  setKind(tab.id);
                  if (tab.id !== "generator") setAiMode(false);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {kind === "generator" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  생성기 선택
                </span>
                <button
                  type="button"
                  className={cn(
                    "h-7 shrink-0 px-2 rounded-sm border text-[11px] font-medium transition-colors",
                    aiMode
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => {
                    setAiMode((v) => !v);
                    if (aiMode) setAiPrompt("");
                  }}
                >
                  AI로 만들기
                </button>
              </div>

              {aiMode ? (
                <YamlMacroAiCreatePanel
                  disabled={disabled}
                  prompt={aiPrompt}
                  onPromptChange={setAiPrompt}
                  onSaved={async (saved) => {
                    await reloadCatalog();
                    setGeneratorKey(saved.key);
                    setAiPrompt("");
                    setAiMode(false);
                  }}
                  onUseExisting={(key) => {
                    setGeneratorKey(key);
                    setAiPrompt("");
                    setAiMode(false);
                  }}
                />
              ) : (
                <>
                  <CollectionVarGeneratorPicker
                    catalog={catalog}
                    value={generatorKey}
                    onValueChange={setGeneratorKey}
                    loading={catalogLoading}
                    disabled={disabled}
                    variant="inline"
                    includeLiteral={false}
                  />
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    → {generatorKeyToYamlMacro(generatorKey)}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {kind === "date" ? (
            <div className="space-y-2">
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
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                →{" "}
                {datePresetToYamlMacro(
                  datePreset,
                  Number.parseInt(dateArg, 10) || 1,
                )}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="h-8 px-2.5 text-xs rounded-sm border border-border hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="h-8 px-2.5 text-xs rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              disabled={aiMode}
              title={
                aiMode
                  ? "AI로 만든 뒤 목록에서 선택하거나 저장하세요"
                  : undefined
              }
              onClick={onConfirm}
            >
              {applyLabel}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {helperText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
