import { ApiError } from "@/api/client";
import { getExecution } from "@/api/executionApi";
import {
  materializeOneRuleCase,
  runTestCaseExecution,
  streamServiceTestCasesExecution,
} from "@/api/testcaseApi";
import type { ExecutionDetailDto, TestCaseReadDto } from "@/api/types";
import {
  consumeExecutionProgressStream,
  type ExecutionRunProgressState,
} from "@/lib/executionProgressStream";
import { focusStepsFromPoolTestCases } from "@/lib/poolTestCaseRun";
import { parseMaterializedTestCaseName } from "@/lib/materializedTestCaseMeta";
import {
  loadExecutionPostmanDefaults,
  saveExecutionPostmanDefaults,
} from "@/lib/executionPostmanDefaults";
import {
  postmanConfigToApi,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { ExternalLink, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ScenarioCollectionVarsDialog } from "../scenario/ScenarioCollectionVarsDialog";
import { ScenarioRunDialogForm } from "../scenario/ScenarioRunDialogForm";
import { ScenarioRunFocusProgress } from "../scenario/ScenarioRunFocusProgress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import {
  FINIX_TC_RUN_CONFIG_MODAL_CONTENT,
  FINIX_TC_RUN_RESULT_MODAL_CONTENT,
} from "@/lib/finixModalLayout";
import { TestCaseRunResultSummary } from "./TestCaseRunResultSummary";
import { saveRulesMetaResume } from "@/lib/rulesMetaResume";

export type RulesMetaRunSession =
  | { kind: "single"; test: TestCaseReadDto }
  | { kind: "all" }
  | { kind: "editor"; caseId: string };

type RulesMetaTestCaseRunDialogProps = {
  serviceCode: string;
  resumeBundleId: number;
  yamlText: string;
  poolRows: TestCaseReadDto[];
  session: RulesMetaRunSession | null;
  onSessionChange: (session: RulesMetaRunSession | null) => void;
  onRunningChange?: (loading: boolean, caseId: string | null) => void;
  onPoolRowsRefresh?: () => void | Promise<void>;
};

export function RulesMetaTestCaseRunDialog({
  serviceCode,
  resumeBundleId,
  yamlText,
  poolRows,
  session,
  onSessionChange,
  onRunningChange,
  onPoolRowsRefresh,
}: RulesMetaTestCaseRunDialogProps) {
  const navigate = useNavigate();
  const [runDraft, setRunDraft] = useState<ScenarioPostmanConfig>(() =>
    loadExecutionPostmanDefaults(),
  );
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runHeaderOpen, setRunHeaderOpen] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionDetailDto | null>(null);
  const [runFocus, setRunFocus] = useState<ExecutionRunProgressState | null>(
    null,
  );
  /** Editor path: set after first materialize; reruns execute the same pool TC. */
  const [editorMaterializedTest, setEditorMaterializedTest] =
    useState<TestCaseReadDto | null>(null);

  const code = serviceCode.trim();

  useEffect(() => {
    if (!session) return;
    setRunError(null);
    setRunResult(null);
    setRunFocus(null);
    setEditorMaterializedTest(null);
    setRunHeaderOpen(false);
    setRunDraft(loadExecutionPostmanDefaults());
  }, [session]);

  const runningCaseId = (() => {
    if (!runLoading || !session) return null;
    if (session.kind === "single") return session.test.rule_case_id;
    if (session.kind === "editor") return session.caseId;
    return null;
  })();

  useEffect(() => {
    onRunningChange?.(runLoading, runningCaseId);
  }, [runLoading, runningCaseId, onRunningChange]);

  const closeRunDialog = useCallback(() => {
    if (runLoading) return;
    setRunHeaderOpen(false);
    onSessionChange(null);
    setRunError(null);
    setRunResult(null);
    setRunFocus(null);
  }, [runLoading, onSessionChange]);

  const runAllWithProgress = async (payload: {
    base_url: string;
    postman: ReturnType<typeof postmanConfigToApi>;
  }): Promise<ExecutionDetailDto> => {
    const done = await consumeExecutionProgressStream(
      (onEvent, signal) =>
        streamServiceTestCasesExecution(code, payload, onEvent, signal),
      focusStepsFromPoolTestCases(poolRows),
      setRunFocus,
    );
    return getExecution(done.execution_id);
  };

  const confirmRun = async () => {
    if (!session) return;
    const baseUrl = runDraft.baseUrl.trim();
    if (!baseUrl) {
      setRunError("실행 API에는 baseUrl이 필요합니다.");
      return;
    }
    setRunLoading(true);
    setRunError(null);
    setRunResult(null);
    setRunFocus(null);
    try {
      saveExecutionPostmanDefaults(runDraft);
      const payload = {
        base_url: baseUrl,
        mode: "live" as const,
        postman: postmanConfigToApi(runDraft),
      };
      let exec: ExecutionDetailDto;
      if (session.kind === "all") {
        exec = await runAllWithProgress(payload);
      } else if (session.kind === "editor") {
        let tc = editorMaterializedTest;
        if (!tc) {
          tc = await materializeOneRuleCase(code, session.caseId, {
            yaml_text: yamlText.trim() ? yamlText : null,
            bundle_id: resumeBundleId,
          });
          setEditorMaterializedTest(tc);
          await onPoolRowsRefresh?.();
        }
        exec = await runTestCaseExecution(tc.svc_code, tc.rule_case_id, payload);
      } else {
        exec = await runTestCaseExecution(
          session.test.svc_code,
          session.test.rule_case_id,
          payload,
        );
      }
      setRunResult(exec);
    } catch (e) {
      setRunError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "테스트 실행에 실패했습니다.",
      );
    } finally {
      setRunLoading(false);
      setRunFocus(null);
    }
  };

  const openExecutionDetail = () => {
    if (!runResult) return;
    const params = new URLSearchParams({
      openService: code,
      openBundle: String(resumeBundleId),
      openTab: "testcases",
    });
    saveRulesMetaResume({
      serviceCode: code,
      bundleId: resumeBundleId,
      activeTab: "testcases",
    });
    navigate(`/execution-result/${runResult.id}`, {
      state: { from: `/rules?${params.toString()}` },
    });
  };

  const runTitle =
    session?.kind === "all"
      ? `${code} · 전체 ${poolRows.length}건`
      : session?.kind === "single"
        ? parseMaterializedTestCaseName(session.test.name).shortLabel ||
          session.test.name
        : session?.kind === "editor"
          ? session.caseId
          : "";

  const editorNeedsMaterialize =
    session?.kind === "editor" && editorMaterializedTest === null;

  const runDialogTitle = runResult
    ? "실행 결과"
    : session?.kind === "all"
      ? "테스트케이스 전체 실행"
      : session?.kind === "editor"
        ? editorNeedsMaterialize
          ? "테스트케이스 생성 및 실행"
          : "테스트케이스 실행"
        : "테스트케이스 실행";

  const confirmLabel = editorNeedsMaterialize ? "생성 및 실행" : "실행";

  const runDescription =
    session?.kind === "all"
      ? "풀에 적재된 테스트케이스를 한 번에 실행합니다."
      : session?.kind === "editor"
        ? editorNeedsMaterialize
          ? "현재 편집 중인 YAML로 테스트케이스를 생성(갱신)한 뒤 실행합니다."
          : "풀에 있는 테스트케이스를 실행합니다."
        : "공용 baseUrl·헤더 변수로 단건 실행합니다.";

  return (
    <>
      <Dialog
        open={session !== null}
        onOpenChange={(open) => {
          if (!open) closeRunDialog();
        }}
      >
        <DialogContent
          className={
            runResult && !runLoading
              ? FINIX_TC_RUN_RESULT_MODAL_CONTENT
              : FINIX_TC_RUN_CONFIG_MODAL_CONTENT
          }
        >
          <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
            <DialogTitle className="pr-10">{runDialogTitle}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <span className="block truncate">{runTitle}</span>
                {!runResult ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {runDescription}
                  </span>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "flex-1 min-h-0 px-5 py-2",
              runResult && !runLoading
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto overscroll-contain",
            )}
          >
            {runLoading && runFocus ? (
              <ScenarioRunFocusProgress
                steps={runFocus.steps}
                currentIndex={runFocus.currentIndex}
                status={runFocus.status}
                total={runFocus.total}
              />
            ) : runLoading ? (
              <div className="flex h-full min-h-[12rem] items-center justify-center py-8">
                <FinixLoading
                  size="md"
                  center
                  label={
                    session?.kind === "all"
                      ? `전체 ${poolRows.length}건 실행 중…`
                      : editorNeedsMaterialize
                        ? "생성 및 실행 중…"
                        : "실행 중…"
                  }
                />
              </div>
            ) : runResult ? (
              <TestCaseRunResultSummary result={runResult} />
            ) : (
              <ScenarioRunDialogForm
                postmanConfig={runDraft}
                onPostmanConfigChange={setRunDraft}
                onOpenHeaderSettings={() => setRunHeaderOpen(true)}
                baseUrlHint="값은 브라우저에 공용 기본으로 저장되어 시나리오 실행과 공유됩니다."
              />
            )}

            {!runLoading && runError ? (
              <p className="mt-3 text-sm text-destructive">{runError}</p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-2 px-5 pb-5 pt-2 border-t border-border">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closeRunDialog}
              disabled={runLoading}
            >
              {runResult ? "닫기" : "취소"}
            </button>
            {runResult ? (
              <>
                <button
                  type="button"
                  className="h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted inline-flex items-center gap-1.5 disabled:opacity-50"
                  onClick={() => void confirmRun()}
                  disabled={runLoading}
                >
                  <Play className="w-3.5 h-3.5" />
                  다시 실행
                </button>
                <FinixPrimaryButton
                  onClick={openExecutionDetail}
                  className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  상세 결과
                </FinixPrimaryButton>
              </>
            ) : (
              <FinixPrimaryButton
                onClick={() => void confirmRun()}
                disabled={runLoading || session === null}
                className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
              >
                {runLoading ? (
                  <>
                    <FinixLoading size="sm" inline />
                    실행 중…
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    {confirmLabel}
                  </>
                )}
              </FinixPrimaryButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScenarioCollectionVarsDialog
        open={session !== null && runHeaderOpen && !runResult}
        onOpenChange={(open) => {
          setRunHeaderOpen(open);
          if (!open) saveExecutionPostmanDefaults(runDraft);
        }}
        config={runDraft}
        onChange={setRunDraft}
        contentClassName="z-[130]"
        description="단건·시나리오 실행에 공통으로 쓰는 채널 헤더입니다. 닫으면 브라우저에 저장됩니다."
      />
    </>
  );
}
