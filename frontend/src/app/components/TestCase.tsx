import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Play,
  Wand2,
} from "lucide-react";
import {
  downloadPostmanCollection,
  generateTestCases,
  listTestCases,
} from "@/api/testcaseApi";
import {
  getScenario,
  resolveScenarioPreview,
} from "@/api/scenarioApi";
import { downloadSavedScenarioPostman } from "@/lib/registryScenarioExport";
import { defaultSinglePostmanDownloadName } from "@/lib/postmanExportDownload";
import {
  emptyPostmanConfig,
  ensurePostmanConfig,
  postmanConfigFromApi,
} from "@/lib/scenarioPostmanVariables";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import {
  mergeWithExecutionDefaults,
  saveExecutionPostmanDefaults,
} from "@/lib/executionPostmanDefaults";
import { ScenarioPostmanExportDialogForm } from "./scenario/ScenarioPostmanExportDialogForm";
import { ScenarioCollectionVarsDialog } from "./scenario/ScenarioCollectionVarsDialog";
import { consumeScenarioExecutionStream } from "@/lib/registryScenarioRun";
import type {
  ScenarioRunFocusStatus,
  ScenarioRunFocusStep,
} from "./scenario/ScenarioRunFocusProgress";
import { ScenarioRunFocusProgress } from "./scenario/ScenarioRunFocusProgress";
import { ScenarioRunDialogForm } from "./scenario/ScenarioRunDialogForm";
import { ApiError } from "@/api/client";
import type {
  ScenarioResolvePreviewDto,
  ScenarioStepDto,
  TestCaseReadDto,
} from "@/api/types";
import { ScenarioRequestBodyPanel } from "./scenario/ScenarioRequestBodyPanel";
import { previewRulesYaml, type ServiceRulePreviewDto } from "@/api/rulesYamlApi";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixField, FinixUnderlineTextarea } from "./ui/finix-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FINIX_LARGE_MODAL_MAX_WIDTH } from "@/lib/finixModalLayout";
import { PageShell } from "./PageShell";
import { PageActionButton } from "./ui/finix-page-action";
import { FinixLoading, FinixLoadingPage } from "./ui/finix-loading";

export function TestCase() {
  const { scenarioId: scenarioIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const scenarioId = Number(scenarioIdParam);
  const from =
    (location.state as { from?: string } | null)?.from ?? "/scenario-registry";

  const [testCases, setTestCases] = useState<TestCaseReadDto[]>([]);
  const [selectedStep, setSelectedStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [scenarioTitle, setScenarioTitle] = useState<string>("");
  const [instruction, setInstruction] = useState<string>("");
  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlPreviews, setYamlPreviews] = useState<ServiceRulePreviewDto[]>([]);
  const [generating, setGenerating] = useState(false);
  const [resolvePreview, setResolvePreview] =
    useState<ScenarioResolvePreviewDto | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rawOpenFor, setRawOpenFor] = useState<ServiceRulePreviewDto | null>(
    null,
  );
  const [postmanExportOpen, setPostmanExportOpen] = useState(false);
  const [postmanExportDraft, setPostmanExportDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [postmanExportFilename, setPostmanExportFilename] = useState("");
  const [postmanExportLoading, setPostmanExportLoading] = useState(false);
  const [postmanExportError, setPostmanExportError] = useState<string | null>(
    null,
  );
  const [scenarioRunOpen, setScenarioRunOpen] = useState(false);
  const [scenarioRunDraft, setScenarioRunDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [scenarioRunError, setScenarioRunError] = useState<string | null>(null);
  const [scenarioRunHeaderOpen, setScenarioRunHeaderOpen] = useState(false);
  const [scenarioRunFocus, setScenarioRunFocus] = useState<{
    steps: ScenarioRunFocusStep[];
    currentIndex: number;
    status: ScenarioRunFocusStatus;
    total: number;
  } | null>(null);

  const postmanExportDefaultFilename = useMemo(
    () => defaultSinglePostmanDownloadName(scenarioTitle || "scenario"),
    [scenarioTitle],
  );

  const extractService = (
    step: ScenarioStepDto,
  ): { code: string; name: string } | null => {
    const reason = String(step.reason ?? "");
    if (reason.includes("code=")) {
      const after = reason.split("code=", 1)[1] ?? "";
      const code = (after.split("|", 1)[0] ?? "").trim();
      if (code) {
        return { code, name: String(step.action ?? code) };
      }
    }

    // Fallback: some scenarios use action as service-code (e.g. "PY016")
    const action = String(step.action ?? "").trim();
    const m = action.match(/^([A-Z]{2}\d{3,})\b/);
    if (m?.[1]) {
      return { code: m[1], name: action };
    }

    // Fallback: try to find "... code=PY016 ..." anywhere
    const m2 = reason.match(/\bcode\s*=\s*([A-Z]{2}\d{3,})\b/);
    if (m2?.[1]) {
      return { code: m2[1], name: action || m2[1] };
    }

    return null;
  };

  useEffect(() => {
    if (!Number.isFinite(scenarioId)) {
      setError("잘못된 주소입니다.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cases = await listTestCases(scenarioId);
        if (cancelled) {
          return;
        }
        setTestCases(cases);
        setSelectedStep(0);
        if (cases.length === 0) {
          setYamlLoading(true);
          const scenario = await getScenario(scenarioId);
          if (cancelled) return;
          setScenarioTitle(scenario.title ?? "");
          const services = (scenario.steps ?? [])
            .map(extractService)
            .filter((x): x is { code: string; name: string } => Boolean(x));
          const unique = [...new Set(services.map((s) => s.code))];
          const previews = await Promise.all(
            unique.map(async (code) => {
              try {
                return await previewRulesYaml(code);
              } catch {
                return {
                  service_code: code,
                  service_name: null,
                  source_version: null,
                  exists: false,
                  filename: `${code}.yaml`,
                  rule_count: 0,
                  rule_ids: [],
                  raw: {},
                } satisfies ServiceRulePreviewDto;
              }
            }),
          );
          if (cancelled) return;
          setYamlPreviews(previews);
        } else {
          setYamlPreviews([]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "데이터를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setYamlLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  const safeIndex = Math.min(
    selectedStep,
    Math.max(0, testCases.length - 1),
  );
  const currentTest = testCases[safeIndex];

  const resolvedRowForCurrent = useMemo(() => {
    if (!currentTest || !resolvePreview) return null;
    return (
      resolvePreview.steps.find(
        (s) =>
          s.svc_code === currentTest.svc_code &&
          s.rule_case_id === currentTest.rule_case_id,
      ) ?? null
    );
  }, [currentTest, resolvePreview]);

  useEffect(() => {
    if (!Number.isFinite(scenarioId) || testCases.length === 0) {
      setResolvePreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setResolveLoading(true);
      try {
        const data = await resolveScenarioPreview(scenarioId, true);
        if (!cancelled) setResolvePreview(data);
      } catch {
        if (!cancelled) setResolvePreview(null);
      } finally {
        if (!cancelled) setResolveLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId, testCases]);

  const totalRules = useMemo(() => {
    return yamlPreviews.reduce((acc, p) => acc + (p.rule_count ?? 0), 0);
  }, [yamlPreviews]);

  const missingYamlCount = useMemo(() => {
    return yamlPreviews.filter((p) => !p.exists).length;
  }, [yamlPreviews]);

  const handleRegenerateFromYaml = async () => {
    if (!Number.isFinite(scenarioId)) return;
    setGenerating(true);
    setError(null);
    try {
      const created = await generateTestCases(
        scenarioId,
        instruction.trim() || null,
      );
      setTestCases(created);
      setSelectedStep(0);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "YAML 재생성에 실패했습니다.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const openScenarioRunDialog = async () => {
    if (!Number.isFinite(scenarioId)) return;
    setScenarioRunError(null);
    setScenarioRunHeaderOpen(false);
    try {
      const scenario = await getScenario(scenarioId);
      setScenarioTitle(scenario.title ?? "");
      setScenarioRunDraft(
        mergeWithExecutionDefaults(
          ensurePostmanConfig(postmanConfigFromApi(scenario.postman)),
        ),
      );
      setScenarioRunOpen(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "시나리오 정보를 불러오지 못했습니다.",
      );
    }
  };

  const confirmScenarioRun = async () => {
    if (!Number.isFinite(scenarioId)) return;
    const baseUrl = scenarioRunDraft.baseUrl?.trim() ?? "";
    if (!baseUrl) {
      setScenarioRunError("실행 API에는 baseUrl이 필요합니다.");
      return;
    }
    setRunning(true);
    setScenarioRunError(null);
    setError(null);
    const seedSteps: ScenarioRunFocusStep[] = testCases.map((tc, idx) => ({
      key: `${tc.svc_code}-${tc.rule_case_id ?? idx}`,
      label: tc.name?.trim() || `Step ${idx + 1}`,
    }));
    setScenarioRunFocus({
      steps: seedSteps,
      currentIndex: 0,
      status: "pending",
      total: Math.max(seedSteps.length, 1),
    });
    try {
      saveExecutionPostmanDefaults(scenarioRunDraft);
      const done = await consumeScenarioExecutionStream(
        {
          scenario_id: scenarioId,
          base_url: baseUrl,
          mode: "live",
        },
        seedSteps,
        setScenarioRunFocus,
      );
      setScenarioRunOpen(false);
      setScenarioRunFocus(null);
      navigate(`/execution-result/${done.execution_id}`, {
        state: { from: `/test-cases/${scenarioId}` },
      });
    } catch (e) {
      setScenarioRunError(
        e instanceof ApiError ? e.message : "테스트 실행에 실패했습니다.",
      );
    } finally {
      setRunning(false);
    }
  };

  const handleExportPostman = async () => {
    if (!currentTest) {
      return;
    }
    try {
      if (Number.isFinite(scenarioId)) {
        await downloadPostmanCollection(
          currentTest.svc_code,
          currentTest.rule_case_id,
          { mode: "resolved", scenarioId },
        );
      } else {
        await downloadPostmanCollection(
          currentTest.svc_code,
          currentTest.rule_case_id,
          { mode: "template" },
        );
      }
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "내보내기에 실패했습니다.",
      );
    }
  };

  const openScenarioPostmanExport = async () => {
    if (!Number.isFinite(scenarioId)) return;
    setPostmanExportError(null);
    setPostmanExportFilename("");
    try {
      const scenario = await getScenario(scenarioId);
      setScenarioTitle(scenario.title ?? "");
      setPostmanExportDraft(
        ensurePostmanConfig(postmanConfigFromApi(scenario.postman)),
      );
      setPostmanExportOpen(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Postman 설정을 불러오지 못했습니다.",
      );
    }
  };

  const closeScenarioPostmanExport = () => {
    if (postmanExportLoading) return;
    setPostmanExportOpen(false);
    setPostmanExportError(null);
  };

  const confirmScenarioPostmanExport = async () => {
    if (!Number.isFinite(scenarioId)) return;
    setPostmanExportLoading(true);
    setPostmanExportError(null);
    setError(null);
    try {
      await downloadSavedScenarioPostman({
        scenarioId,
        title: scenarioTitle || `scenario-${scenarioId}`,
        postmanConfig: postmanExportDraft,
        downloadName: postmanExportFilename,
      });
      setPostmanExportOpen(false);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : "Postman 컬렉션 export에 실패했습니다.";
      setPostmanExportError(message);
      setError(message);
    } finally {
      setPostmanExportLoading(false);
    }
  };

  if (loading) {
    return <FinixLoadingPage label="불러오는 중…" />;
  }

  return (
    <PageShell
      icon={<Wand2 className="w-5 h-5" strokeWidth={2} />}
      title="테스트 케이스"
      actions={
        <PageActionButton
          onClick={() => {
            if (from) {
              navigate(from);
              return;
            }
            navigate(-1);
          }}
          title="시나리오 관리로"
        >
          <ArrowLeft className="w-4 h-4" />
          뒤로
        </PageActionButton>
      }
    >

        <div className="flex-1 min-h-0 flex rounded-sm border border-border bg-card shadow-sm overflow-hidden">
        <div className="w-80 border-r border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <h3>테스트 시나리오</h3>
          <p className="text-sm text-muted-foreground">
            {testCases.length}개 테스트
          </p>
        </div>

        <div className="space-y-2">
          {testCases.map((tc, index) => (
            <button
              type="button"
              key={`${tc.svc_code}-${tc.rule_case_id}`}
              onClick={() => setSelectedStep(index)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-sm transition-colors shadow-sm ${
                safeIndex === index
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-card border border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">
                  {index + 1}
                </div>
                <span className="text-sm text-left">{tc.name}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
        </div>

          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto p-8 space-y-6">
          {error && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!currentTest ? (
            <div className="space-y-6">
              <div>
                <h2>테스트 케이스 생성</h2>
                <p className="text-muted-foreground">
                  시나리오: {scenarioTitle || "—"}
                </p>
              </div>

              <div className="bg-card border border-border rounded-sm p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">YAML 규칙 미리보기</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {yamlLoading
                        ? "불러오는 중…"
                        : `${yamlPreviews.length}개 서비스 · ${totalRules}개 규칙${
                            missingYamlCount ? ` · YAML 없음 ${missingYamlCount}개` : ""
                          }`}
                    </div>
                    {!yamlLoading && yamlPreviews.length === 0 ? (
                      <div className="mt-2 text-xs text-destructive">
                        이 시나리오에서 서비스 코드를 찾지 못했습니다. (steps의 `reason`에
                        `code=서비스코드`가 포함되거나, `action`이 `PY016` 같은 서비스코드여야 합니다.)
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {yamlPreviews.map((p) => (
                    <div
                      key={p.service_code}
                      className="rounded-sm border border-border bg-background/50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {p.service_name || p.service_code}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {p.service_code}
                            {p.filename ? `  ·  ${p.filename}` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {p.exists ? `${p.rule_count} rules` : "YAML 없음"}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-muted-foreground font-mono line-clamp-1">
                          {p.rule_ids?.length ? p.rule_ids.slice(0, 6).join(", ") : "—"}
                          {p.rule_ids && p.rule_ids.length > 6 ? " …" : ""}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            className="h-7 px-2 rounded-sm border border-border bg-background text-[11px] font-medium hover:bg-muted transition-colors inline-flex items-center gap-1"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [p.service_code]: !prev[p.service_code],
                              }))
                            }
                            disabled={!p.exists}
                            title={p.exists ? "규칙 보기" : "YAML 파일이 없습니다"}
                          >
                            규칙
                            <ChevronDown
                              className={[
                                "w-3.5 h-3.5 transition-transform",
                                expanded[p.service_code] ? "rotate-180" : "",
                              ].join(" ")}
                            />
                          </button>
                          <button
                            type="button"
                            className="h-7 px-2 rounded-sm border border-border bg-background text-[11px] font-medium hover:bg-muted transition-colors"
                            onClick={() => setRawOpenFor(p)}
                            disabled={!p.exists}
                            title={p.exists ? "RAW 보기" : "YAML 파일이 없습니다"}
                          >
                            RAW 보기
                          </button>
                        </div>
                      </div>

                      {p.exists && expanded[p.service_code] ? (
                        <div className="mt-3 space-y-3">
                          <div className="rounded-sm border border-border bg-secondary/40 px-3 py-2">
                            <div className="text-xs font-medium">규칙</div>
                            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {(p.raw?.rules as unknown as Array<{ rule_id?: string; description?: string }>)?.slice(
                                0,
                                8,
                              )?.map((r, idx) => (
                                <li key={`${p.service_code}-${idx}`} className="flex gap-2">
                                  <span className="font-mono text-[11px]">
                                    {r.rule_id ?? `RULE-${idx + 1}`}
                                  </span>
                                  <span className="truncate">{r.description ?? "—"}</span>
                                </li>
                              )) ?? null}
                            </ul>
                          </div>

                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <FinixField
                  label="프롬프트(추가 지시사항)"
                  helperText="예: Negative 케이스만 생성 / 특정 필드 조합만 포함 / 규칙 우선순위 등"
                >
                  <FinixUnderlineTextarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    className="min-h-[120px]"
                    placeholder="추가로 반영할 조건/의도를 입력하세요."
                  />
                </FinixField>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <FinixPrimaryButton
                    onClick={() => void handleRegenerateFromYaml()}
                    disabled={generating || yamlLoading || yamlPreviews.length === 0}
                    className="px-6 h-10 rounded-sm gap-2"
                  >
                    {generating ? (
                      <FinixLoading size="sm" inline />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    {generating ? "재생성 중…" : "YAML에서 재생성"}
                  </FinixPrimaryButton>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2>테스트 케이스 #{safeIndex + 1}</h2>
                  <p className="text-muted-foreground">{currentTest.name}</p>
                  {resolveLoading ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      연결 미리보기 갱신 중…
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {Number.isFinite(scenarioId) ? (
                    <button
                      type="button"
                      onClick={() => void openScenarioPostmanExport()}
                      className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors shadow-sm text-sm"
                    >
                      <Download className="w-4 h-4" />
                      시나리오 Postman
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleExportPostman()}
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors shadow-sm text-sm"
                  >
                    <Download className="w-4 h-4" />
                    포스트맨으로 내보내기
                  </button>
                  <FinixPrimaryButton
                    onClick={() => void openScenarioRunDialog()}
                    disabled={running || testCases.length === 0}
                    className="px-6 h-10"
                  >
                    <Play className="w-4 h-4" />
                    {running ? "실행 중…" : "테스트 실행"}
                  </FinixPrimaryButton>
                </div>
              </div>

              <div className="space-y-4">
                <h3>API 요청</h3>
                <div className="bg-card border border-border rounded-sm p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <span className="px-3 py-1 bg-primary/10 text-primary rounded-sm text-sm">
                      {currentTest.method ?? "—"}
                    </span>
                    <code className="text-sm text-muted-foreground break-all">
                      {currentTest.endpoint ?? ""}
                    </code>
                  </div>

                  <ScenarioRequestBodyPanel
                    templateBody={currentTest.request_body}
                    resolvedRow={resolvedRowForCurrent}
                    contextAfter={resolvePreview?.context_after ?? null}
                    injectWarnings={resolvePreview?.global_warnings}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3>예상 결과</h3>
                <div className="bg-card border border-border rounded-sm p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      상태 코드:
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        (currentTest.expected_status ?? 0) < 300
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {currentTest.expected_status ?? "—"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      응답 데이터
                    </label>
                    <pre className="bg-secondary border border-border rounded-sm p-4 text-sm overflow-x-auto">
                      <code>
                        {JSON.stringify(currentTest.expected_body, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}

          <Dialog
            open={scenarioRunOpen}
            onOpenChange={(open) => {
              if (!running) {
                if (!open) {
                  setScenarioRunHeaderOpen(false);
                  setScenarioRunFocus(null);
                }
                setScenarioRunOpen(open);
              }
            }}
          >
            <DialogContent className="w-full max-w-md rounded-sm">
              <DialogHeader>
                <DialogTitle className="pr-10">시나리오 실행</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-1">
                    <span>{scenarioTitle || `#${scenarioId}`}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      테스트 케이스 {testCases.length}개 · inject/extract 적용 후 실행
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>
              {!running ? (
                <ScenarioRunDialogForm
                  postmanConfig={scenarioRunDraft}
                  onPostmanConfigChange={setScenarioRunDraft}
                  onOpenHeaderSettings={() => setScenarioRunHeaderOpen(true)}
                />
              ) : null}
              {running && scenarioRunFocus ? (
                <ScenarioRunFocusProgress
                  steps={scenarioRunFocus.steps}
                  currentIndex={scenarioRunFocus.currentIndex}
                  status={scenarioRunFocus.status}
                  total={scenarioRunFocus.total}
                />
              ) : running ? (
                <div className="py-6">
                  <FinixLoading size="md" center label="시나리오 실행 중…" />
                </div>
              ) : scenarioRunError ? (
                <p className="text-sm text-destructive">{scenarioRunError}</p>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-sm border border-border hover:bg-muted"
                  onClick={() => {
                    setScenarioRunHeaderOpen(false);
                    setScenarioRunFocus(null);
                    setScenarioRunOpen(false);
                  }}
                  disabled={running}
                >
                  취소
                </button>
                <FinixPrimaryButton
                  onClick={() => void confirmScenarioRun()}
                  disabled={running}
                  className="px-4 h-9"
                >
                  <Play className="w-4 h-4" />
                  {running ? "실행 중…" : "실행"}
                </FinixPrimaryButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ScenarioCollectionVarsDialog
            open={scenarioRunOpen && scenarioRunHeaderOpen}
            onOpenChange={(open) => {
              setScenarioRunHeaderOpen(open);
              if (!open) saveExecutionPostmanDefaults(scenarioRunDraft);
            }}
            config={scenarioRunDraft}
            onChange={setScenarioRunDraft}
            contentClassName="z-[130]"
            description="단건·시나리오 실행에 공통으로 쓰는 채널 헤더입니다. 닫으면 브라우저에 저장됩니다."
          />

          <Dialog
            open={postmanExportOpen}
            onOpenChange={(open) => {
              if (!open) closeScenarioPostmanExport();
            }}
          >
            <DialogContent className="w-full max-w-md rounded-sm">
              <DialogHeader>
                <DialogTitle className="pr-10">Postman 컬렉션 다운로드</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-1">
                    <span>{scenarioTitle || `#${scenarioId}`}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      변수 연결·body 고정값이 포함된 Postman 컬렉션입니다.
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {!postmanExportLoading ? (
                <ScenarioPostmanExportDialogForm
                  postmanConfig={postmanExportDraft}
                  onPostmanConfigChange={setPostmanExportDraft}
                  filename={postmanExportFilename}
                  onFilenameChange={setPostmanExportFilename}
                  defaultFilename={postmanExportDefaultFilename}
                  baseUrlHint="baseUrl은 이번 export에만 적용되며, 저장 후 다음 다운로드에도 유지됩니다."
                />
              ) : null}

              {postmanExportLoading ? (
                <div className="py-6">
                  <FinixLoading
                    size="md"
                    center
                    label="Postman 파일 생성 중…"
                  />
                </div>
              ) : postmanExportError ? (
                <p className="text-sm text-destructive">{postmanExportError}</p>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                  onClick={closeScenarioPostmanExport}
                  disabled={postmanExportLoading}
                >
                  취소
                </button>
                <FinixPrimaryButton
                  onClick={() => void confirmScenarioPostmanExport()}
                  disabled={postmanExportLoading}
                  className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
                >
                  {postmanExportLoading ? (
                    <>
                      <FinixLoading size="sm" inline />
                      생성 중…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      다운로드
                    </>
                  )}
                </FinixPrimaryButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={rawOpenFor != null}
            onOpenChange={(open) => {
              if (!open) setRawOpenFor(null);
            }}
          >
            <DialogContent
              className={`w-full max-h-[92vh] overflow-hidden flex flex-col ${FINIX_LARGE_MODAL_MAX_WIDTH} gap-0 p-0`}
            >
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left space-y-2">
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <DialogTitle className="text-lg leading-snug font-semibold">
                    {rawOpenFor?.service_name ||
                      rawOpenFor?.service_code ||
                      "RAW"}
                  </DialogTitle>
                  {rawOpenFor?.service_code ? (
                    <span className="font-mono text-sm text-muted-foreground">
                      {rawOpenFor.service_code}
                    </span>
                  ) : null}
                  {rawOpenFor?.filename ? (
                    <span className="text-xs text-muted-foreground">
                      {rawOpenFor.filename}
                    </span>
                  ) : null}
                </div>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground text-left">
                  YAML 원본(파싱 결과) RAW를 확인합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
                <pre className="bg-secondary border border-border rounded-sm p-3 text-xs overflow-x-auto">
                  <code>{JSON.stringify(rawOpenFor?.raw ?? {}, null, 2)}</code>
                </pre>
              </div>
            </DialogContent>
          </Dialog>
            </div>
          </div>
        </div>
    </PageShell>
  );
}
