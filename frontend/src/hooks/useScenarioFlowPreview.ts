import { useCallback, useEffect, useState } from "react";
import { resolveScenarioPreviewInline } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type {
  ScenarioResolvePreviewDto,
  ScenarioStepDto,
  TestCaseRefDto,
} from "@/api/types";

export function useScenarioFlowPreview(
  steps: ScenarioStepDto[],
  perStep: TestCaseRefDto[][],
  enabled: boolean,
) {
  const [preview, setPreview] = useState<ScenarioResolvePreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const hasIds = perStep.some((row) => row.length > 0);
    if (!enabled || !hasIds || steps.length === 0) {
      setPreview(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await resolveScenarioPreviewInline({
        steps,
        per_step: perStep,
        simulate_responses: true,
      });
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof ApiError
          ? e.message
          : "실행 예상 흐름을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, steps, perStep]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 450);
    return () => window.clearTimeout(t);
  }, [load]);

  return { preview, loading, error, reload: load };
}
