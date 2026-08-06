import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { resolveScenarioPreviewInline } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type {
  ScenarioResolvePreviewDto,
  ScenarioStepDto,
  TestCaseRefDto,
} from "@/api/types";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  steps: ScenarioStepDto[];
  perStep: TestCaseRefDto[][];
  enabled?: boolean;
};

export function ScenarioResolvePreviewCard({
  steps,
  perStep,
  enabled = true,
}: Props) {
  const [preview, setPreview] = useState<ScenarioResolvePreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const hasIds = perStep.some((row) => row.length > 0);
    if (!enabled || !hasIds) {
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
        e instanceof ApiError ? e.message : "연결 미리보기를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, steps, perStep]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 400);
    return () => window.clearTimeout(t);
  }, [load]);

  const warnings = [
    ...(preview?.global_warnings ?? []),
    ...(preview?.steps.flatMap((s) => s.inject_warnings) ?? []),
  ];

  return (
    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">연결 미리보기</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            템플릿 body에 inject가 반영된 결과입니다 (저장되지 않음).
          </p>
        </div>
        <button
          type="button"
          className="h-8 w-8 rounded-sm border border-border bg-background hover:bg-muted inline-flex items-center justify-center"
          onClick={() => void load()}
          disabled={loading}
          title="새로고침"
        >
          {loading ? (
            <FinixLoading size="sm" inline />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {error ? (
        <div className="text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : null}

      {!perStep.some((r) => r.length > 0) ? (
        <p className="text-xs text-muted-foreground">
          1단계에서 풀 테스트 케이스를 선택하면 미리보기가 표시됩니다.
        </p>
      ) : loading && !preview ? (
        <FinixLoading size="sm" inline label="미리보기 계산 중…" />
      ) : preview ? (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {preview.steps.map((s, i) => (
            <div
              key={`${s.svc_code}-${s.rule_case_id}-${i}`}
              className="rounded-sm border border-border bg-background px-3 py-2 text-xs"
            >
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-muted-foreground font-mono mt-1 line-clamp-2">
                {JSON.stringify(s.resolved_request_body)}
              </div>
            </div>
          ))}
          {Object.keys(preview.context_after).length > 0 ? (
            <div className="text-[11px] text-muted-foreground">
              컨텍스트:{" "}
              <span className="font-mono">
                {JSON.stringify(preview.context_after)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs space-y-1">
          {warnings.slice(0, 5).map((w) => (
            <div key={w}>{w}</div>
          ))}
          {warnings.length > 5 ? (
            <div className="text-muted-foreground">외 {warnings.length - 5}건</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
