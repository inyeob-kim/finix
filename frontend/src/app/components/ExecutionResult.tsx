import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { getExecution } from "@/api/executionApi";
import { ApiError } from "@/api/client";
import type { ExecutionDetailDto, ExecutionStepDto } from "@/api/types";
import { PageShell } from "./PageShell";
import { FinixLoadingPage } from "./ui/finix-loading";

interface RowView {
  step: string;
  status: "passed" | "failed";
  expected: unknown;
  actual: unknown;
  error?: string;
}

function mapSteps(rows: ExecutionStepDto[]): RowView[] {
  return rows.map((s) => ({
    step: s.step_label,
    status: s.status,
    expected: s.expected,
    actual: s.actual,
    error: s.error_message ?? undefined,
  }));
}

export function ExecutionResult() {
  const { executionId: executionIdParam } = useParams();
  const executionId = Number(executionIdParam);

  const [detail, setDetail] = useState<ExecutionDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!Number.isFinite(executionId)) {
      setError("잘못된 실행 ID입니다.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getExecution(executionId);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "결과를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [executionId]);

  const results = detail ? mapSteps(detail.steps) : [];
  const summary = detail?.summary as { passed?: number; failed?: number } | undefined;
  const passed =
    summary?.passed ??
    results.filter((r) => r.status === "passed").length;
  const failed =
    summary?.failed ??
    results.filter((r) => r.status === "failed").length;

  const toggleExpand = (index: number) => {
    const next = new Set(expandedSteps);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExpandedSteps(next);
  };

  if (loading) {
    return <FinixLoadingPage label="결과를 불러오는 중…" />;
  }

  if (error || !detail) {
    return (
      <PageShell
        icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
        title="실행 결과"
        description="실행 요약과 단계별 비교(예상/실제)를 확인합니다."
      >
        <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-xl">
          {error ?? "결과를 찾을 수 없습니다."}
        </div>
      </PageShell>
    );
  }

  const ranAt = new Date(detail.created_at).toLocaleString("ko-KR");

  return (
    <PageShell
      icon={<CheckCircle2 className="w-5 h-5" strokeWidth={2} />}
      title="실행 결과"
      description={`테스트 실행 완료: ${ranAt}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-sm p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">
              전체 테스트
            </div>
            <div className="text-3xl">{results.length}</div>
          </div>
          <div className="bg-card border border-border rounded-sm p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">성공</div>
            <div className="text-3xl text-success">{passed}</div>
          </div>
          <div className="bg-card border border-border rounded-sm p-6 shadow-sm">
            <div className="text-sm text-muted-foreground mb-2">실패</div>
            <div className="text-3xl text-destructive">{failed}</div>
          </div>
      </div>

        <div className="space-y-4">
          <h3>테스트 단계</h3>
          {results.map((result, index) => (
            <div
              key={`${result.step}-${index}`}
              className="bg-card border border-border rounded-sm overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleExpand(index)}
                className="w-full flex items-center justify-between p-5 hover:bg-accent/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {result.status === "passed" ? (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4>
                        {index + 1}단계: {result.step}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          result.status === "passed"
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {result.status === "passed" ? "성공" : "실패"}
                      </span>
                    </div>
                    {result.error && (
                      <p className="text-sm text-destructive mt-1">
                        {result.error}
                      </p>
                    )}
                  </div>
                </div>
                {expandedSteps.has(index) ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
              </button>

              {expandedSteps.has(index) && (
                <div className="border-t border-border p-5 space-y-4 bg-secondary">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        예상 결과
                      </label>
                      <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto">
                        <code>
                          {JSON.stringify(result.expected, null, 2)}
                        </code>
                      </pre>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">
                        실제 결과
                      </label>
                      <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto">
                        <code>
                          {JSON.stringify(result.actual, null, 2)}
                        </code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {failed > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-md p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h3>참고</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              일부 단계가 예상과 다릅니다. 상세는 각 단계를 펼쳐 예상/실제 페이로드를 비교하세요.
            </p>
          </div>
        )}
    </PageShell>
  );
}
