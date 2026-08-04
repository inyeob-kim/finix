import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { SuggestedBindingLinkDto } from "@/api/types";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runSteps: ScenarioRunStep[];
  loading: boolean;
  error: string | null;
  message: string | null;
  links: SuggestedBindingLinkDto[];
  onFetch: () => void;
  onApplyAll: () => void;
  onApplySelected: (links: SuggestedBindingLinkDto[]) => void;
  disabled?: boolean;
};

function linkKey(link: SuggestedBindingLinkDto, index: number): string {
  return `${link.from_service_index}-${link.to_service_index}-${link.var}-${link.response_path}-${link.request_path}-${index}`;
}

function confidenceLabel(confidence: SuggestedBindingLinkDto["confidence"]): string {
  if (confidence === "high") return "높음";
  if (confidence === "medium") return "보통";
  return "낮음";
}

export function ScenarioAiSuggestionsPanel({
  open,
  onOpenChange,
  runSteps,
  loading,
  error,
  message,
  links,
  onFetch,
  onApplyAll,
  onApplySelected,
  disabled = false,
}: Props) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const keys = useMemo(
    () => links.map((link, i) => linkKey(link, i)),
    [links],
  );

  useEffect(() => {
    // New suggestion batch → select all by default so "선택 적용" is useful immediately.
    setSelectedKeys(new Set(keys));
  }, [keys]);

  const selectedCount = selectedKeys.size;
  const allSelected = links.length > 0 && selectedCount === links.length;

  const toggleKey = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? new Set(keys) : new Set());
  };

  const handleApplySelected = () => {
    const selected = links.filter((_, i) => selectedKeys.has(keys[i]!));
    if (selected.length === 0) return;
    onApplySelected(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg rounded-sm">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-1.5 pr-8">
            <Sparkles className="w-4 h-4" />
            AI 연결 제안
          </DialogTitle>
          <DialogDescription>
            DTO 스켈레톤을 분석해 연결 후보를 제안합니다. 원하는 항목만 선택해
            적용할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="py-6">
              <FinixLoading
                size="md"
                center
                label="연결 후보 분석 중…"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onFetch}
                  className="h-8 px-3 rounded-sm border border-primary/30 text-xs font-medium hover:bg-primary/10 disabled:opacity-50"
                >
                  제안 불러오기
                </button>
                <button
                  type="button"
                  disabled={disabled || selectedCount === 0}
                  onClick={handleApplySelected}
                  className="h-8 px-3 rounded-sm bg-primary/90 text-primary-foreground text-xs font-medium hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  선택 적용{selectedCount > 0 ? ` (${selectedCount})` : ""}
                </button>
                <button
                  type="button"
                  disabled={disabled || links.length === 0}
                  onClick={onApplyAll}
                  className="h-8 px-3 rounded-sm border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  모두 적용
                </button>
              </div>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              {message ? (
                <p className="text-[11px] text-muted-foreground">{message}</p>
              ) : null}

              {links.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      disabled={disabled}
                      aria-label="전체 선택"
                    />
                    <span>
                      전체 선택 ({selectedCount}/{links.length})
                    </span>
                  </label>
                  <ul className="max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-muted/20 px-2 py-2">
                    {links.map((link, i) => {
                      const key = keys[i]!;
                      const checked = selectedKeys.has(key);
                      const fromLabel = runSteps[link.from_service_index]
                        ? runStepCaseIdLabel(runSteps[link.from_service_index]!)
                        : `${link.from_service_index + 1}단계`;
                      const toLabel = runSteps[link.to_service_index]
                        ? runStepCaseIdLabel(runSteps[link.to_service_index]!)
                        : `${link.to_service_index + 1}단계`;
                      return (
                        <li key={key}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-sm px-1.5 py-1.5 hover:bg-muted/60",
                              checked && "bg-primary/5",
                            )}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(v) =>
                                toggleKey(key, v === true)
                              }
                              disabled={disabled}
                              aria-label={`${link.var} 선택`}
                            />
                            <span className="min-w-0 flex-1 space-y-0.5 text-[11px]">
                              <span className="flex flex-wrap items-center gap-1.5 font-mono">
                                <span className="font-medium text-foreground">
                                  {link.var}
                                </span>
                                <span className="text-muted-foreground">
                                  {fromLabel} → {toLabel}
                                </span>
                                <span className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">
                                  {confidenceLabel(link.confidence)}
                                </span>
                              </span>
                              <span className="block font-mono text-[10px] text-muted-foreground break-all">
                                {link.response_path || "—"} →{" "}
                                {link.request_path || "—"}
                              </span>
                              {link.reason ? (
                                <span className="block text-[10px] text-muted-foreground">
                                  {link.reason}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
