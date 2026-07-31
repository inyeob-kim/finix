import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { ArrowLeft, Layers } from "lucide-react";
import type { ExecutionBatchMeta } from "@/lib/executionBatchView";
import {
  batchItemsFromMeta,
  buildExecutionBatchPath,
  firstFailedExecutionId,
  parseExecutionIdsFromSearch,
  summarizeBatch,
} from "@/lib/executionBatchView";
import { loadBatchExecutions } from "@/lib/executionBatchLoad";
import type { LoadedBatchExecution } from "@/lib/executionBatchLoad";
import {
  PAGE_SECTION_STACK_CLASS,
} from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import { PageActionButton } from "./ui/finix-page-action";
import { FinixLoadingPage } from "./ui/finix-loading";
import {
  ExecutionBatchSidebar,
  ExecutionBatchSingleLink,
  ExecutionBatchSummaryBar,
} from "./execution/ExecutionBatchSidebar";
import { ExecutionTimelinePanel } from "./execution/ExecutionTimelinePanel";

type LocationState = {
  from?: string;
  batchMeta?: ExecutionBatchMeta;
};

export function ExecutionBatchResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const backTo = state?.from ?? "/scenario-registry";
  const batchMeta = state?.batchMeta;

  const ids = useMemo(
    () => parseExecutionIdsFromSearch(`?${searchParams.toString()}`),
    [searchParams],
  );

  const [loaded, setLoaded] = useState<LoadedBatchExecution[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const titleMap = useMemo(() => {
    const map = new Map<number, string>();
    batchMeta?.runs.forEach((r) => map.set(r.executionId, r.title));
    return map;
  }, [batchMeta]);

  const listItems = useMemo(() => {
    if (loaded.length > 0) {
      return loaded.map((row) => row.listItem);
    }
    if (batchMeta) return batchItemsFromMeta(batchMeta);
    return [];
  }, [loaded, batchMeta]);

  const summary = useMemo(() => summarizeBatch(listItems), [listItems]);

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false);
      setLoaded([]);
      setLoadErrors(["실행 ID가 없습니다."]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { loaded: rows, errors } = await loadBatchExecutions(ids, titleMap);
      if (cancelled) return;
      setLoaded(rows);
      setLoadErrors([
        ...errors,
        ...(batchMeta?.errors ?? []),
      ]);
      const items = rows.map((r) => r.listItem);
      const first =
        firstFailedExecutionId(items) ?? items[0]?.executionId ?? null;
      setSelectedId(first);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, batchMeta, titleMap]);

  const selected = loaded.find((r) => r.detail.id === selectedId) ?? null;
  const batchReturnPath = buildExecutionBatchPath(ids);

  const handleBack = () => navigate(backTo);

  const backButton = (
    <PageActionButton onClick={handleBack}>
      <ArrowLeft className="w-4 h-4" />
      뒤로
    </PageActionButton>
  );

  if (loading) {
    return <FinixLoadingPage label="배치 실행 결과를 불러오는 중…" />;
  }

  if (ids.length === 0 || listItems.length === 0) {
    return (
      <PageShell
        icon={<Layers className="w-5 h-5" strokeWidth={2} />}
        title="배치 실행 결과"
        actions={backButton}
      >
        <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-xl">
          {loadErrors[0] ?? "표시할 실행 결과가 없습니다."}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      icon={<Layers className="w-5 h-5" strokeWidth={2} />}
      title="배치 실행 결과"
      actions={backButton}
    >
      <div className={PAGE_SECTION_STACK_CLASS}>
      <ExecutionBatchSummaryBar
        collectionName={batchMeta?.collectionName}
        scenarioCount={summary.scenarioCount}
        failedScenarios={summary.failedScenarios}
        passedSteps={summary.passedSteps}
        failedSteps={summary.failedSteps}
        skipped={batchMeta?.skipped}
        onJumpToFirstFailure={
          summary.failedScenarios > 0
            ? () => {
                const id = firstFailedExecutionId(listItems);
                if (id != null) setSelectedId(id);
              }
            : undefined
        }
      />

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <ExecutionBatchSidebar
          items={listItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
          runErrors={loadErrors.length > 0 ? loadErrors : undefined}
        />
        <div className="flex-1 min-w-0 w-full">
          {selected ? (
            <>
              <div className="flex justify-end mb-2">
                <ExecutionBatchSingleLink
                  executionId={selected.detail.id}
                  batchReturnPath={batchReturnPath}
                />
              </div>
              <ExecutionTimelinePanel detail={selected.detail} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              왼쪽에서 시나리오를 선택하세요.
            </p>
          )}
        </div>
      </div>
      </div>
    </PageShell>
  );
}
