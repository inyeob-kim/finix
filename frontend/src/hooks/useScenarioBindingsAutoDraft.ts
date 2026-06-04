import { useCallback, useEffect, useRef, useState } from "react";
import { suggestScenarioBindings } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type { SuggestedBindingLinkDto } from "@/api/types";
import {
  bindingsFromSuggestionLinks,
  countBindingRows,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";

type AutoDraftState = {
  loading: boolean;
  error: string | null;
  message: string | null;
  lastLinks: SuggestedBindingLinkDto[];
  source: "llm" | "heuristic" | "hybrid" | null;
};

export function useScenarioBindingsAutoDraft(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  onBindingsChange: (next: StepBindingsByStepKey) => void,
  enabled: boolean,
) {
  const [state, setState] = useState<AutoDraftState>({
    loading: false,
    error: null,
    message: null,
    lastLinks: [],
    source: null,
  });
  const ranForKeyRef = useRef<string | null>(null);

  const runKey = runSteps.map((s) => s.stepKey).join("|");

  const applySuggestion = useCallback(
    async (mode: "append" | "replace") => {
      if (runSteps.length < 2) return;
      setState((s) => ({ ...s, loading: true, error: null, message: null }));
      try {
        const codes = runSteps.map((s) => s.serviceCode);
        const result = await suggestScenarioBindings(codes);
        const next = bindingsFromSuggestionLinks(
          runSteps,
          result.links,
          mode === "append" ? bindings : undefined,
          mode,
        );
        onBindingsChange(next);
        setState({
          loading: false,
          error: null,
          message:
            result.summary?.trim() ||
            `실행 흐름을 자동으로 구성했습니다 (${result.link_count}건)`,
          lastLinks: result.links,
          source: result.source,
        });
      } catch (e) {
        setState({
          loading: false,
          error:
            e instanceof ApiError
              ? e.message
              : "자동 연결 초안을 만들지 못했습니다.",
          message: null,
          lastLinks: [],
          source: null,
        });
      }
    },
    [bindings, onBindingsChange, runSteps],
  );

  useEffect(() => {
    if (!enabled || runSteps.length < 2) return;
    if (ranForKeyRef.current === runKey) return;
    ranForKeyRef.current = runKey;

    const existing = countBindingRows(bindings);
    if (existing > 0) return;

    void applySuggestion("replace");
  }, [enabled, runKey, runSteps.length, bindings, applySuggestion]);

  const resetDraftKey = useCallback(() => {
    ranForKeyRef.current = null;
  }, []);

  return {
    ...state,
    applySuggestion,
    resetDraftKey,
  };
}
