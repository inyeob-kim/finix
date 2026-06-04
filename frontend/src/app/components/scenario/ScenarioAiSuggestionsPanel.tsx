import { Check, Sparkles } from "lucide-react";
import type { SuggestedBindingLinkDto } from "@/api/types";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixLoading } from "../ui/finix-loading";

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
  disabled?: boolean;
};

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
  disabled = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-1.5 pr-8">
            <Sparkles className="w-4 h-4" />
            AI 연결 제안
          </DialogTitle>
          <DialogDescription>
            DTO 스켈레톤을 분석해 연결 후보를 제안합니다. 적용 여부는 직접 결정하세요.
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
                  disabled={disabled || links.length === 0}
                  onClick={onApplyAll}
                  className="h-8 px-3 rounded-sm bg-primary/90 text-primary-foreground text-xs font-medium hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  모두 적용
                </button>
              </div>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              {message ? (
                <p className="text-[11px] text-muted-foreground">{message}</p>
              ) : null}

              {links.length > 0 ? (
                <ul className="text-[11px] font-mono space-y-1 max-h-48 overflow-y-auto rounded-sm border border-border bg-muted/20 px-2 py-2">
                  {links.map((link, i) => (
                    <li
                      key={`${link.from_service_index}-${link.to_service_index}-${link.var}-${i}`}
                      className="flex flex-wrap items-center gap-1"
                    >
                      <span className="text-emerald-700 dark:text-emerald-400">✓</span>
                      <span className="text-foreground">{link.var}</span>
                      <span className="text-muted-foreground">
                        {runSteps[link.from_service_index]
                          ? runStepCaseIdLabel(runSteps[link.from_service_index])
                          : `${link.from_service_index + 1}단계`}{" "}
                        →{" "}
                        {runSteps[link.to_service_index]
                          ? runStepCaseIdLabel(runSteps[link.to_service_index])
                          : `${link.to_service_index + 1}단계`}
                      </span>
                    </li>
                  ))}
                </ul>
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
