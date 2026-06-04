import { useState } from "react";
import { Sparkles } from "lucide-react";
import { suggestScenarioBindings } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import {
  bindingsFromSuggestionLinks,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
  disabled?: boolean;
  className?: string;
};

export function ScenarioBindingsAiSuggest({
  runSteps,
  bindings,
  onBindingsChange,
  disabled = false,
  className = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codes = runSteps.map((s) => s.serviceCode);
  const canSuggest = runSteps.length >= 2 && !disabled;

  const handleSuggest = async () => {
    if (!canSuggest) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await suggestScenarioBindings(codes);
      const next = bindingsFromSuggestionLinks(
        runSteps,
        result.links,
        bindings,
        "replace",
      );
      onBindingsChange(next);
      const src =
        result.source === "llm"
          ? "AI"
          : result.source === "hybrid"
            ? "AI+규칙"
            : "자동";
      setMessage(`${src}: ${result.link_count}개 연결 적용`);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "연결 제안을 가져오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (runSteps.length < 2) return null;

  const status = error ?? message;

  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`.trim()}>
      <button
        type="button"
        disabled={!canSuggest || loading}
        onClick={() => void handleSuggest()}
        title="1단계 선택 순서 기준으로 인접 테스트 케이스 간 연결을 제안합니다"
        className="h-9 px-4 rounded-sm border border-primary/40 bg-background hover:bg-primary/10 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
      >
        {loading ? (
          <FinixLoading size="sm" inline />
        ) : (
          <Sparkles className="w-4 h-4 text-primary" />
        )}
        {loading ? "제안 중…" : "연결 다시 제안"}
      </button>
      {status ? (
        <span
          className={`text-[11px] max-w-[min(280px,40vw)] truncate ${
            error ? "text-destructive" : "text-muted-foreground"
          }`}
          title={status}
        >
          {status}
        </span>
      ) : null}
    </span>
  );
}
