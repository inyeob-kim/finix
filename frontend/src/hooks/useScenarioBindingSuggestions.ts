import { useCallback, useState } from "react";
import { suggestScenarioBindings } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type { SuggestedBindingLinkDto } from "@/api/types";
import {
  bindingsFromSuggestionLinks,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";

/** Manual-only binding suggestions (no auto-apply on mount). */
export function useScenarioBindingSuggestions(
  runSteps: ScenarioRunStep[],
  bindings: StepBindingsByStepKey,
  onBindingsChange: (next: StepBindingsByStepKey) => void,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastLinks, setLastLinks] = useState<SuggestedBindingLinkDto[]>([]);
  const [source, setSource] = useState<"llm" | "heuristic" | "hybrid" | null>(
    null,
  );

  const fetchSuggestions = useCallback(async () => {
    if (runSteps.length < 2) return [];
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const codes = runSteps.map((s) => s.serviceCode);
      const result = await suggestScenarioBindings(codes);
      setLastLinks(result.links);
      setSource(result.source);
      setMessage(
        result.summary?.trim() ||
          `연결 제안 ${result.link_count}건`,
      );
      return result.links;
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "제안을 불러오지 못했습니다.",
      );
      setLastLinks([]);
      setSource(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, [runSteps]);

  const applySuggestions = useCallback(
    async (mode: "append" | "replace" = "replace") => {
      const links =
        lastLinks.length > 0 ? lastLinks : await fetchSuggestions();
      if (links.length === 0) return;
      const next = bindingsFromSuggestionLinks(
        runSteps,
        links,
        mode === "append" ? bindings : undefined,
        mode,
      );
      onBindingsChange(next);
      setMessage(`런타임 흐름에 연결 ${links.length}건을 적용했습니다`);
    },
    [bindings, fetchSuggestions, lastLinks, onBindingsChange, runSteps],
  );

  return {
    loading,
    error,
    message,
    lastLinks,
    source,
    fetchSuggestions,
    applySuggestions,
  };
}
