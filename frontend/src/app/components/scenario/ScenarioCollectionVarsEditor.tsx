import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import {
  newStartVar,
  replaceCustomStartVars,
  splitStartVarsForUi,
  updateStartVarValue,
  type PostmanStartVar,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";

type Props = {
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  focusCustomVarRowId?: string | null;
  onFocusCustomVarRowDone?: () => void;
  isFavoriteKey?: (key: string) => boolean;
  onToggleFavorite?: (key: string, value: string) => void;
};

function ChannelVarRow({
  row,
  onValueChange,
}: {
  row: PostmanStartVar;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <span className="font-mono text-xs w-[4.5rem] shrink-0 text-muted-foreground">
        {row.key}
      </span>
      <FinixUnderlineInput
        value={row.value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="값"
        className="font-mono text-xs flex-1"
      />
    </div>
  );
}

export function ScenarioCollectionVarsEditor({
  config,
  onChange,
  focusCustomVarRowId,
  onFocusCustomVarRowDone,
  isFavoriteKey,
  onToggleFavorite,
}: Props) {
  const [channelOpen, setChannelOpen] = useState(false);
  const keyInputRefs = useRef(new Map<string, HTMLInputElement>());
  const { channelVars, customVars } = splitStartVarsForUi(config);

  useEffect(() => {
    if (!focusCustomVarRowId) return;
    const frame = requestAnimationFrame(() => {
      keyInputRefs.current.get(focusCustomVarRowId)?.focus();
      onFocusCustomVarRowDone?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusCustomVarRowId, customVars, onFocusCustomVarRowDone]);

  const updateCustomVars = (nextCustom: PostmanStartVar[]) => {
    onChange(replaceCustomStartVars(config, nextCustom));
  };

  const addCustomVar = () => {
    const row = newStartVar();
    updateCustomVars([...customVars, row]);
  };

  return (
    <div className="space-y-3">
      <Collapsible open={channelOpen} onOpenChange={setChannelOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left hover:bg-muted/40">
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
              !channelOpen && "-rotate-90",
            )}
          />
          <span className="text-xs font-medium">채널 정보 (BXM)</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2 pl-1">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Live·Export 시{" "}
            <span className="font-mono">x-bxm-systemheader</span>에 자동
            반영됩니다.
          </p>
          {channelVars.map((row) => (
            <ChannelVarRow
              key={row.key}
              row={row}
              onValueChange={(value) =>
                onChange(updateStartVarValue(config, row.key, value))
              }
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">시나리오 변수</span>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 h-7 px-2 rounded-sm border border-border text-[11px] font-medium text-primary hover:bg-primary/10"
            onClick={addCustomVar}
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          실행 전부터 필요한 값
        </p>
        {customVars.length === 0 ? (
          <p className="text-[10px] text-muted-foreground border border-dashed rounded-sm px-2 py-2">
            추가 변수가 없습니다.
          </p>
        ) : (
          customVars.map((row) => (
            <div key={row.id} className="flex gap-2 items-center">
              <FinixUnderlineInput
                ref={(el) => {
                  if (el) keyInputRefs.current.set(row.id, el);
                  else keyInputRefs.current.delete(row.id);
                }}
                value={row.key}
                onChange={(e) =>
                  updateCustomVars(
                    customVars.map((r) =>
                      r.id === row.id ? { ...r, key: e.target.value } : r,
                    ),
                  )
                }
                placeholder="변수명"
                className="font-mono text-xs flex-1"
              />
              <FinixUnderlineInput
                value={row.value}
                onChange={(e) =>
                  updateCustomVars(
                    customVars.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r,
                    ),
                  )
                }
                placeholder="값"
                className="font-mono text-xs flex-1"
              />
              {onToggleFavorite ? (
                <button
                  type="button"
                  className={cn(
                    "p-1.5 transition-colors",
                    row.key.trim() && isFavoriteKey?.(row.key.trim())
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-muted-foreground hover:text-amber-500",
                    !row.key.trim() && "opacity-30 pointer-events-none",
                  )}
                  onClick={() => onToggleFavorite(row.key, row.value)}
                  aria-label="즐겨찾기"
                  disabled={!row.key.trim()}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      row.key.trim() &&
                        isFavoriteKey?.(row.key.trim()) &&
                        "fill-current",
                    )}
                  />
                </button>
              ) : null}
              <button
                type="button"
                className="p-1.5 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  updateCustomVars(customVars.filter((r) => r.id !== row.id))
                }
                aria-label="삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
