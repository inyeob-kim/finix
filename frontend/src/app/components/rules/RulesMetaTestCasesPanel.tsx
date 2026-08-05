import { ApiError } from "@/api/client";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
  downloadServicePostmanCollection,
  runServiceTestCasesExecution,
  runTestCaseExecution,
} from "@/api/testcaseApi";
import type { ExecutionDetailDto, TestCaseReadDto } from "@/api/types";
import {
  compareTestCasesByCaseId,
  inferPathKindFromTestCase,
  parseMaterializedTestCaseName,
  testCaseMatchesQuery,
} from "@/lib/materializedTestCaseMeta";
import {
  loadExecutionPostmanDefaults,
  saveExecutionPostmanDefaults,
} from "@/lib/executionPostmanDefaults";
import type { ScenarioRunMode } from "@/lib/registryScenarioRun";
import { saveRulesMetaResume } from "@/lib/rulesMetaResume";
import {
  postmanConfigToApi,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { Download, ExternalLink, Play, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmPopover } from "../scenarioRegistry/components/ConfirmPopover";
import { ScenarioCollectionVarsDialog } from "../scenario/ScenarioCollectionVarsDialog";
import { ScenarioRunDialogForm } from "../scenario/ScenarioRunDialogForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import {
  FINIX_TC_RUN_CONFIG_MODAL_CONTENT,
  FINIX_TC_RUN_RESULT_MODAL_CONTENT,
} from "@/lib/finixModalLayout";
import { RulesMetaTestCasesTable } from "./RulesMetaTestCasesTable";
import { TestCaseRunResultSummary } from "./TestCaseRunResultSummary";

const ICON_BTN =
  "h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

const SECONDARY_BTN =
  "h-9 px-3 text-xs rounded-sm border border-border font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5";

type PathFilter = "" | "N" | "E";

type RunSession =
  | { kind: "single"; test: TestCaseReadDto }
  | { kind: "all" };

type RulesMetaTestCasesPanelProps = {
  serviceCode: string;
  /** Bundle currently open in the YAML edit modal (for resume after detail). */
  resumeBundleId: number;
  /** Current editor YAML — used so macros in the open document are materialized. */
  yamlText?: string;
  /** Operating (active) YAML version for this service, if any. */
  activeBundleVersion?: number | null;
  /** True when the open modal bundle is a draft, not the active one. */
  editingDraft?: boolean;
  active?: boolean;
  disabled?: boolean;
};

export function RulesMetaTestCasesPanel({
  serviceCode,
  resumeBundleId,
  yamlText = "",
  activeBundleVersion = null,
  editingDraft = false,
  active = true,
  disabled = false,
}: RulesMetaTestCasesPanelProps) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [pathFilter, setPathFilter] = useState<PathFilter>("");
  const [runSession, setRunSession] = useState<RunSession | null>(null);
  const [runMode, setRunMode] = useState<ScenarioRunMode>("live");
  const [runDraft, setRunDraft] = useState<ScenarioPostmanConfig>(() =>
    loadExecutionPostmanDefaults(),
  );
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runHeaderOpen, setRunHeaderOpen] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionDetailDto | null>(null);
  const [exportAllLoading, setExportAllLoading] = useState(false);

  const code = serviceCode.trim();
  const hasActiveYaml = activeBundleVersion != null;

  const loadTestCases = useCallback(async () => {
    if (!code) {
      setRows([]);
      return;
    }
    setListLoading(true);
    try {
      setRows(await listTestCasesByServiceCode(code, 500));
    } catch (e) {
      setRows([]);
      toast.error(
        e instanceof ApiError
          ? e.message
          : "테스트 케이스를 불러오지 못했습니다.",
      );
    } finally {
      setListLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (!active || !code) return;
    setExpandedId(null);
    void loadTestCases();
  }, [active, code, loadTestCases]);

  const filteredRows = useMemo(() => {
    const list = rows.filter((r) => {
      if (pathFilter && inferPathKindFromTestCase(r) !== pathFilter) return false;
      return testCaseMatchesQuery(r, query);
    });
    return [...list].sort(compareTestCasesByCaseId);
  }, [rows, pathFilter, query]);

  const generateDisabledReason = (() => {
    if (!code) return "서비스를 선택하세요.";
    if (!yamlText.trim() && !hasActiveYaml) {
      return "YAML이 없습니다. YAML 탭에서 작성·저장한 뒤 생성하세요.";
    }
    if (disabled) return "다른 작업이 진행 중입니다.";
    if (generateLoading) return "생성 중입니다.";
    return null;
  })();

  const runGenerate = async () => {
    if (!code || generateDisabledReason) return;
    setReplaceConfirmOpen(false);
    setGenerateLoading(true);
    try {
      const created = await materializeTestCasesForService(code, {
        replace_existing: true,
        bundle_id: resumeBundleId,
        yaml_text: yamlText.trim() ? yamlText : null,
      });
      toast.success(`${created.length}건의 테스트 케이스를 생성했습니다.`);
      setRows(created);
      try {
        const listed = await listTestCasesByServiceCode(code, 500);
        if (listed.length > 0) {
          setRows(listed);
        }
      } catch {
        // Keep `created` rows if refresh fails.
      }
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "테스트 케이스를 생성하지 못했습니다.",
      );
    } finally {
      setGenerateLoading(false);
    }
  };

  const requestGenerate = () => {
    if (generateDisabledReason) return;
    if (rows.length > 0) {
      setReplaceConfirmOpen(true);
      return;
    }
    void runGenerate();
  };

  const beginRunSession = (session: RunSession) => {
    setRunError(null);
    setRunResult(null);
    setRunMode("live");
    setRunHeaderOpen(false);
    setRunDraft(loadExecutionPostmanDefaults());
    setRunSession(session);
  };

  const openRunDialog = (test: TestCaseReadDto) => {
    beginRunSession({ kind: "single", test });
  };

  const openRunAllDialog = () => {
    if (rows.length === 0 || disabled || runLoading) return;
    beginRunSession({ kind: "all" });
  };

  const exportAllPostman = async () => {
    if (!code || rows.length === 0 || exportAllLoading) return;
    setExportAllLoading(true);
    try {
      await downloadServicePostmanCollection(code);
      toast.success(`Postman 컬렉션을 내보냈습니다. (${rows.length}건)`);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Postman 내보내기에 실패했습니다.",
      );
    } finally {
      setExportAllLoading(false);
    }
  };

  const closeRunDialog = () => {
    if (runLoading) return;
    setRunHeaderOpen(false);
    setRunSession(null);
    setRunError(null);
    setRunResult(null);
  };

  const confirmRun = async () => {
    if (!runSession) return;
    const baseUrl = runDraft.baseUrl.trim();
    if (runMode === "live" && !baseUrl) {
      setRunError("실행 API에는 baseUrl이 필요합니다.");
      return;
    }
    setRunLoading(true);
    setRunError(null);
    setRunResult(null);
    try {
      saveExecutionPostmanDefaults(runDraft);
      const payload = {
        base_url: baseUrl,
        mode: runMode,
        postman: postmanConfigToApi(runDraft),
      };
      const exec =
        runSession.kind === "all"
          ? await runServiceTestCasesExecution(code, payload)
          : await runTestCaseExecution(runSession.test.id, payload);
      setRunResult(exec);
    } catch (e) {
      setRunError(
        e instanceof ApiError ? e.message : "테스트 실행에 실패했습니다.",
      );
    } finally {
      setRunLoading(false);
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

  const emptyMessage = !yamlText.trim() && !hasActiveYaml
    ? "YAML이 없어 테스트케이스를 생성할 수 없습니다. YAML 탭에서 작성하세요."
    : rows.length === 0
      ? "이 서비스에 적재된 테스트케이스가 없습니다. 「테스트케이스 생성」을 눌러 현재 YAML로 만들어 주세요."
      : "검색 조건에 맞는 테스트케이스가 없습니다.";

  const runTitle =
    runSession?.kind === "all"
      ? `${code} · 전체 ${rows.length}건`
      : runSession?.kind === "single"
        ? parseMaterializedTestCaseName(runSession.test.name).shortLabel ||
          runSession.test.name
        : "";
  const runDialogTitle = runResult
    ? "실행 결과"
    : runSession?.kind === "all"
      ? "테스트케이스 전체 실행"
      : "테스트케이스 실행";
  const runningSingleId =
    runLoading && runSession?.kind === "single" ? runSession.test.id : null;

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <div className="flex flex-col gap-1.5 min-w-0 lg:max-w-[min(100%,24rem)]">
            <p className="text-xs text-muted-foreground leading-snug">
              생성 기준:{" "}
              {yamlText.trim() ? (
                <span className="font-medium text-foreground">
                  현재 편집 중인 YAML
                </span>
              ) : hasActiveYaml ? (
                <span className="font-medium text-foreground">
                  적용된 YAML
                </span>
              ) : (
                <span className="font-medium text-destructive">적용된 YAML 없음</span>
              )}
              {editingDraft && yamlText.trim() ? (
                <span>
                  {" "}
                  · 저장·적용 전이어도 에디터 내용으로 생성합니다
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <button
              type="button"
              className={SECONDARY_BTN}
              disabled={
                rows.length === 0 || disabled || listLoading || runLoading
              }
              title={
                rows.length === 0
                  ? "실행할 테스트케이스가 없습니다."
                  : `풀 ${rows.length}건 전체 실행`
              }
              onClick={openRunAllDialog}
            >
              <Play className="w-3.5 h-3.5" />
              전체 실행
              {rows.length > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  · {rows.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={SECONDARY_BTN}
              disabled={
                rows.length === 0 ||
                disabled ||
                listLoading ||
                exportAllLoading
              }
              title={
                rows.length === 0
                  ? "내보낼 테스트케이스가 없습니다."
                  : `풀 ${rows.length}건 Postman 전체 내보내기`
              }
              onClick={() => void exportAllPostman()}
            >
              {exportAllLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              전체 Export
            </button>
            <ConfirmPopover
              open={replaceConfirmOpen}
              onOpenChange={setReplaceConfirmOpen}
              align="end"
              title="기존 테스트케이스를 교체할까요?"
              description={`현재 풀 ${rows.length}건을 삭제한 뒤 지금 편집 중인 YAML로 다시 생성합니다.`}
              cancelLabel="취소"
              confirmLabel="교체 생성"
              confirmClassName="h-8 px-3 rounded-sm bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90"
              onCancel={() => setReplaceConfirmOpen(false)}
              onConfirm={() => void runGenerate()}
              anchor={
                <span className="inline-flex shrink-0">
                  <FinixPrimaryButton
                    type="button"
                    className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
                    disabled={Boolean(generateDisabledReason)}
                    title={generateDisabledReason ?? undefined}
                    onClick={requestGenerate}
                  >
                    {generateLoading ? (
                      <FinixLoading size="sm" inline />
                    ) : null}
                    테스트케이스 생성
                  </FinixPrimaryButton>
                </span>
              }
            />
            <button
              type="button"
              className={ICON_BTN}
              disabled={listLoading || !code || disabled}
              title="목록 새로고침"
              aria-label="목록 새로고침"
              onClick={() => void loadTestCases()}
            >
              {listLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="flex gap-1 rounded-sm border border-border p-0.5">
          {(
            [
              { id: "" as const, label: "전체" },
              { id: "N" as const, label: "N" },
              { id: "E" as const, label: "E" },
            ] as const
          ).map((t) => (
            <button
              key={t.id || "all"}
              type="button"
              className={cn(
                "h-8 px-3 text-xs rounded-sm",
                pathFilter === t.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setPathFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <FinixUnderlineInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·case_id·엔드포인트 검색"
            className="pl-7"
          />
        </div>
        {query || pathFilter ? (
          <span className="text-xs text-muted-foreground">
            {filteredRows.length}/{rows.length}건
          </span>
        ) : null}
      </div>

      <RulesMetaTestCasesTable
        rows={filteredRows}
        listLoading={listLoading}
        emptyMessage={emptyMessage}
        expandedId={expandedId}
        onToggleExpand={(id) =>
          setExpandedId((prev) => (prev === id ? null : id))
        }
        runningId={runningSingleId}
        onRun={openRunDialog}
      />

      <Dialog
        open={runSession !== null}
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
        >          <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
            <DialogTitle className="pr-10">{runDialogTitle}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <span className="block truncate">{runTitle}</span>
                {!runResult ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {runSession?.kind === "all"
                      ? "풀에 적재된 테스트케이스를 한 번에 실행합니다."
                      : "공용 baseUrl·헤더 변수로 단건 실행합니다."}
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
            {runLoading ? (
              <div className="flex h-full min-h-[12rem] items-center justify-center py-8">
                <FinixLoading
                  size="md"
                  center
                  label={
                    runSession?.kind === "all"
                      ? `전체 ${rows.length}건 실행 중…`
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
                mode={runMode}
                onModeChange={setRunMode}
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
                disabled={runLoading || runSession === null}
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
                    실행
                  </>
                )}
              </FinixPrimaryButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScenarioCollectionVarsDialog
        open={runSession !== null && runHeaderOpen && !runResult}
        onOpenChange={(open) => {
          setRunHeaderOpen(open);
          if (!open) saveExecutionPostmanDefaults(runDraft);
        }}
        config={runDraft}
        onChange={setRunDraft}
        contentClassName="z-[130]"
        description="단건·시나리오 실행에 공통으로 쓰는 채널 헤더입니다. 닫으면 브라우저에 저장됩니다."
      />
    </div>
  );
}
