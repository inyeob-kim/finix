import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, History, PlayCircle, RotateCw } from "lucide-react";
import { getExecution, runScenarioExecution } from "@/api/executionApi";
import { getScenario } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import {
  buildExecutionRerunPayload,
  validateExecutionRerunPayload,
} from "@/lib/executionRerun";
import {
  PAGE_SECTION_STACK_CLASS,
} from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import { FinixLoading, FinixLoadingPage } from "./ui/finix-loading";
import { ExecutionTimelinePanel } from "./execution/ExecutionTimelinePanel";
import { PageActionButton } from "./ui/finix-page-action";

export function ExecutionResult() {
  const { executionId: executionIdParam } = useParams();
  const executionId = Number(executionIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const backTo =
    (location.state as { from?: string } | null)?.from ?? "/scenario-registry";

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getExecution>> | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExecution(id);
      setDetail(data);
    } catch (e) {
      setDetail(null);
      setError(
        e instanceof ApiError ? e.message : "결과를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!Number.isFinite(executionId)) {
      setError("잘못된 실행 ID입니다.");
      setLoading(false);
      return;
    }
    setRerunning(false);
    setRunError(null);
    void loadDetail(executionId);
  }, [executionId, loadDetail]);

  useEffect(() => {
    if (!detail?.scenario_id) {
      setScenarioTitle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scenario = await getScenario(detail.scenario_id!);
        if (!cancelled) setScenarioTitle(scenario.title ?? null);
      } catch {
        if (!cancelled) setScenarioTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.scenario_id]);

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    navigate(-1);
  };

  const handleRunAgain = async () => {
    if (!detail) return;
    setRunError(null);
    const payload = buildExecutionRerunPayload(detail);
    if (!payload) {
      setRunError("시나리오 ID가 없어 다시 실행할 수 없습니다.");
      return;
    }
    const validationError = validateExecutionRerunPayload(payload);
    if (validationError) {
      setRunError(validationError);
      return;
    }
    setRerunning(true);
    try {
      const result = await runScenarioExecution(payload);
      navigate(`/execution-result/${result.id}`, {
        state: { from: backTo },
      });
    } catch (e) {
      setRunError(
        e instanceof ApiError ? e.message : "다시 실행하지 못했습니다.",
      );
      setRerunning(false);
    }
  };

  const canRerun = detail?.scenario_id != null;
  const historyHref =
    detail?.scenario_id != null
      ? `/history?scenarioId=${detail.scenario_id}`
      : "/history";

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {canRerun ? (
        <PageActionButton
          variant="primary"
          onClick={() => void handleRunAgain()}
          disabled={rerunning || loading}
        >
          <RotateCw className="w-4 h-4" />
          다시 실행
        </PageActionButton>
      ) : null}
      <PageActionButton
        onClick={() => navigate(historyHref, { state: { from: location.pathname } })}
      >
        <History className="w-4 h-4" />
        실행 이력
      </PageActionButton>
      <PageActionButton onClick={handleBack}>
        <ArrowLeft className="w-4 h-4" />
        뒤로
      </PageActionButton>
    </div>
  );

  if (loading) {
    return <FinixLoadingPage label="결과를 불러오는 중…" />;
  }

  if (error || !detail) {
    return (
      <PageShell
        icon={<PlayCircle className="w-5 h-5" strokeWidth={2} />}
        title="실행 결과"
        description="Postman Run과 동일한 형식으로 테스트 결과를 확인합니다."
        actions={actions}
      >
        <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-xl">
          {error ?? "결과를 찾을 수 없습니다."}
        </div>
      </PageShell>
    );
  }

  const pageTitle = scenarioTitle?.trim()
    ? `${scenarioTitle} — 실행 결과`
    : `실행 결과 #${detail.id}`;

  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      <PageShell
        icon={<PlayCircle className="w-5 h-5" strokeWidth={2} />}
        title={pageTitle}
        actions={actions}
      >
        <div className={PAGE_SECTION_STACK_CLASS}>
        {runError ? (
          <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {runError}
          </div>
        ) : null}

        <ExecutionTimelinePanel detail={detail} />
        </div>
      </PageShell>

      {rerunning ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/80"
          aria-live="polite"
          aria-busy="true"
        >
          <FinixLoading size="lg" label="다시 실행 중…" center />
        </div>
      ) : null}
    </div>
  );
}
