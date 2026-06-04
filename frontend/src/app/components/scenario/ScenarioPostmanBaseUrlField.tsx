import { useEffect, useRef, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { newStartVar } from "@/lib/scenarioPostmanVariables";
import { FinixField, FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";

type Props = {
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  showStartVars?: boolean;
  hideBaseUrl?: boolean;
  hideStartVarsHeader?: boolean;
  focusStartVarRowId?: string | null;
  onFocusStartVarRowDone?: () => void;
  isFavoriteKey?: (key: string) => boolean;
  onToggleFavorite?: (key: string, value: string) => void;
};

export function ScenarioPostmanBaseUrlField({
  config,
  onChange,
  showStartVars = false,
  hideBaseUrl = false,
  hideStartVarsHeader = false,
  focusStartVarRowId,
  onFocusStartVarRowDone,
  isFavoriteKey,
  onToggleFavorite,
}: Props) {
  const [internalFocusRowId, setInternalFocusRowId] = useState<string | null>(null);
  const keyInputRefs = useRef(new Map<string, HTMLInputElement>());

  const activeFocusRowId = focusStartVarRowId ?? internalFocusRowId;

  useEffect(() => {
    if (!activeFocusRowId) return;
    const frame = requestAnimationFrame(() => {
      keyInputRefs.current.get(activeFocusRowId)?.focus();
      setInternalFocusRowId(null);
      onFocusStartVarRowDone?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeFocusRowId, config.startVars, onFocusStartVarRowDone]);

  const addStartVar = () => {
    const row = newStartVar();
    onChange({
      ...config,
      startVars: [...config.startVars, row],
    });
    setInternalFocusRowId(row.id);
  };
  return (
    <div className="space-y-3">
      {!hideBaseUrl ? (
        <FinixField
          label="baseUrl"
          helperText="Postman 요청 URL 접두사 ({{baseUrl}}/…)"
        >
          <FinixUnderlineInput
            value={config.baseUrl}
            onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
            placeholder="https://localhost:8080"
            className="font-mono text-sm"
          />
        </FinixField>
      ) : null}
      {showStartVars ? (
        <div className="space-y-2">
          {!hideStartVarsHeader ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                컬렉션 변수 · 실행 전 값
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                onClick={addStartVar}
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
            </div>
          ) : null}
          {config.startVars.map((row) => (
            <div key={row.id} className="flex gap-2 items-center">
              <FinixUnderlineInput
                ref={(el) => {
                  if (el) keyInputRefs.current.set(row.id, el);
                  else keyInputRefs.current.delete(row.id);
                }}
                value={row.key}
                onChange={(e) =>
                  onChange({
                    ...config,
                    startVars: config.startVars.map((r) =>
                      r.id === row.id ? { ...r, key: e.target.value } : r,
                    ),
                  })
                }
                placeholder="변수명"
                className="font-mono text-xs flex-1"
              />
              <FinixUnderlineInput
                value={row.value}
                onChange={(e) =>
                  onChange({
                    ...config,
                    startVars: config.startVars.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r,
                    ),
                  })
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
                  onChange({
                    ...config,
                    startVars: config.startVars.filter((r) => r.id !== row.id),
                  })
                }
                aria-label="삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
