import { useEffect, useState, type ReactNode } from "react";
import {
  listCollectionVarGenerators,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import {
  encodeGeneratorRef,
  isKoreanNameGeneratorKey,
  KOREAN_NAME_PART_OPTIONS,
  type KoreanNameMacroPart,
} from "@/lib/generatorRef";
import { COLLECTION_VAR_GENERATORS } from "@/lib/collectionVarGenerators";
import { pushRecentGeneratorKey } from "@/lib/collectionVarGeneratorPicker";
import { CollectionVarGeneratorPicker } from "../scenario/CollectionVarGeneratorPicker";
import { YamlMacroAiCreatePanel } from "../rules/YamlMacroAiCreatePanel";
import { cn } from "../ui/utils";

export type DynamicGeneratorSelection = {
  /** Picker mode: ``literal`` or generator key (without name part). */
  mode: string;
  namePart: KoreanNameMacroPart;
  /** Encoded generator for persistence (null when literal). */
  generator: string | null;
  catalog: CollectionVarGeneratorDto[];
  /** AI draft UI open — parent should disable apply/submit. */
  aiActive: boolean;
};

type Props = {
  disabled?: boolean;
  title?: string;
  /** Include 「고정값」 row (scenario declare dialog). */
  includeLiteral?: boolean;
  autoFocusSearch?: boolean;
  className?: string;
  listClassName?: string;
  /** Re-load / reset when this changes (e.g. dialog open). */
  resetToken?: unknown;
  /** Initial picker mode when resetToken changes. */
  initialMode?: string;
  initialNamePart?: KoreanNameMacroPart;
  onSelectionChange?: (selection: DynamicGeneratorSelection) => void;
  /** Extra controls under the header (right of AI toggle). */
  headerExtra?: ReactNode;
  /** Below picker / AI (e.g. source panel). */
  children?: ReactNode;
};

function fallbackCatalog(): CollectionVarGeneratorDto[] {
  return COLLECTION_VAR_GENERATORS.map((g) => ({
    key: g.id,
    label: g.label,
    description: g.hint,
    hint: g.hint,
    source: "builtin" as const,
    impl_kind: g.id,
  }));
}

/**
 * Shared generator picker + AI create + Korean-name part chips.
 * Used by YAML dynamic-value rail and scenario collection-var declare dialog.
 */
export function DynamicGeneratorSourcePanel({
  disabled = false,
  title = "값 출처",
  includeLiteral = false,
  autoFocusSearch = true,
  className,
  listClassName,
  resetToken,
  initialMode = includeLiteral ? "literal" : "today_yyyymmdd",
  initialNamePart = "full",
  onSelectionChange,
  headerExtra,
  children,
}: Props) {
  const [catalog, setCatalog] = useState<CollectionVarGeneratorDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [namePart, setNamePart] = useState<KoreanNameMacroPart>(initialNamePart);
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const reloadCatalog = async () => {
    setCatalogLoading(true);
    try {
      setCatalog(await listCollectionVarGenerators());
    } catch {
      setCatalog(fallbackCatalog());
    } finally {
      setCatalogLoading(false);
    }
  };

  const emit = (
    nextMode: string,
    nextPart: KoreanNameMacroPart,
    nextCatalog: CollectionVarGeneratorDto[],
    nextAi: boolean,
  ) => {
    onSelectionChange?.({
      mode: nextMode,
      namePart: nextPart,
      generator: encodeGeneratorRef(nextMode, nextPart),
      catalog: nextCatalog,
      aiActive: nextAi,
    });
  };

  useEffect(() => {
    setMode(initialMode);
    setNamePart(initialNamePart);
    setAiMode(false);
    setAiPrompt("");
    void reloadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    emit(mode, namePart, catalog, aiMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, namePart, catalog, aiMode]);

  const showNameParts =
    !aiMode && isKoreanNameGeneratorKey(mode);

  const selectMode = (next: string) => {
    setMode(next);
    setAiMode(false);
    setAiPrompt("");
    if (isKoreanNameGeneratorKey(next)) {
      setNamePart("full");
    }
    if (next !== "literal") {
      pushRecentGeneratorKey(next);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-l border-border bg-muted/10",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <div className="flex items-center gap-1.5">
          {headerExtra}
          <button
            type="button"
            className={cn(
              "h-7 shrink-0 rounded-sm border px-2 text-[11px] font-medium transition-colors",
              aiMode
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            disabled={disabled}
            onClick={() => {
              if (aiMode) {
                setAiMode(false);
                setAiPrompt("");
                return;
              }
              setAiMode(true);
            }}
          >
            {aiMode ? "목록으로" : "AI로 만들기"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        {aiMode ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <YamlMacroAiCreatePanel
              disabled={disabled}
              prompt={aiPrompt}
              onPromptChange={setAiPrompt}
              onSaved={async (saved) => {
                await reloadCatalog();
                selectMode(saved.key);
              }}
              onUseExisting={(key) => {
                selectMode(key);
              }}
            />
          </div>
        ) : (
          <CollectionVarGeneratorPicker
            catalog={catalog}
            value={mode}
            onValueChange={selectMode}
            loading={catalogLoading}
            disabled={disabled}
            variant="inline"
            includeLiteral={includeLiteral}
            autoFocusSearch={autoFocusSearch}
            className="min-h-0 flex-1"
            listClassName={listClassName ?? "min-h-0 flex-1"}
          />
        )}

        {showNameParts ? (
          <div className="shrink-0 space-y-1.5 border-t border-border/60 pt-2">
            <span className="text-[11px] text-muted-foreground">넣을 값</span>
            <div className="flex flex-wrap gap-1">
              {KOREAN_NAME_PART_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  className={cn(
                    "h-7 px-2 rounded-sm border text-[11px]",
                    namePart === opt.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setNamePart(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
