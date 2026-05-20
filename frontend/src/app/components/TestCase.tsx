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
  getTestCase,
  listTestCases,
} from "@/api/testcaseApi";
import { createScenario, getScenario, patchScenario } from "@/api/scenarioApi";
import { runScenarioExecution } from "@/api/executionApi";
import { ApiError } from "@/api/client";
import type { ScenarioStepDto, TestCaseReadDto } from "@/api/types";
import { previewRulesYaml, type ServiceRulePreviewDto } from "@/api/rulesYamlApi";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixField, FinixUnderlineTextarea } from "./ui/finix-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FINIX_LARGE_MODAL_MAX_WIDTH } from "@/lib/finixModalLayout";
import { PageShell } from "./PageShell";
import { FinixLoading, FinixLoadingPage } from "./ui/finix-loading";

type RegistryScenarioPayload = {
  title: string;
  description?: string;
  tags?: string[];
  serviceSequence: Array<{ code: string; name: string }>;
  /** DB test case ids chosen in the scenario registry (preferred over YAML-only picks). */
  testcaseSelections?: Array<{
    id: number;
    scenarioId: number | null;
    name: string;
    serviceCode: string;
  }>;
  /** When set (legacy), YAML previews are filtered to these rules only. */
  ruleSelections?: Array<{
    serviceCode: string;
    ruleId: string;
    title?: string;
  }>;
};

function filterPreviewByRuleSelections(
  preview: ServiceRulePreviewDto,
  selections: NonNullable<RegistryScenarioPayload["ruleSelections"]>,
): ServiceRulePreviewDto {
  const wantIds = new Set(
    selections
      .filter((s) => s.serviceCode === preview.service_code)
      .map((s) => s.ruleId.trim())
      .filter(Boolean),
  );
  if (wantIds.size === 0) return preview;
  const raw = { ...(preview.raw ?? {}) };
  const rules = Array.isArray(raw.rules) ? raw.rules : [];
  const filtered = rules.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const rid = (r as { rule_id?: unknown }).rule_id;
    return typeof rid === "string" && wantIds.has(rid.trim());
  });
  raw.rules = filtered;
  const rule_ids = filtered
    .map((r) => String((r as { rule_id?: string }).rule_id ?? "").trim())
    .filter(Boolean);
  return {
    ...preview,
    rule_count: filtered.length,
    rule_ids,
    raw,
    exists: preview.exists || filtered.length > 0,
  };
}

export function TestCase() {
  const { scenarioId: scenarioIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const scenarioId = Number(scenarioIdParam);
  const from =
    (location.state as { from?: string } | null)?.from ?? "/scenario-registry";
  const registryPayload =
    (location.state as { registry?: RegistryScenarioPayload } | null)?.registry ??
    null;
  const isRegistryMode = !Number.isFinite(scenarioId) && registryPayload != null;

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rawOpenFor, setRawOpenFor] = useState<ServiceRulePreviewDto | null>(
    null,
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
    if (!Number.isFinite(scenarioId) && !isRegistryMode) {
      setError("잘못된 주소입니다.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (isRegistryMode && registryPayload) {
          setTestCases([]);
          setSelectedStep(0);
          setScenarioTitle(registryPayload.title ?? "");
          setYamlLoading(true);
          const unique = [
            ...new Set((registryPayload.serviceSequence ?? []).map((s) => s.code)),
          ];
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
          const tcSel = registryPayload.testcaseSelections;
          if (tcSel && tcSel.length > 0) {
            const loaded = await Promise.all(
              tcSel.map(async (t) => {
                try {
                  return await getTestCase(t.id);
                } catch {
                  return null;
                }
              }),
            );
            const ok = loaded.filter((x): x is TestCaseReadDto => x != null);
            if (!cancelled) {
              setTestCases(ok);
              setSelectedStep(0);
            }
            setYamlPreviews(previews);
          } else {
            const sel = registryPayload.ruleSelections;
            const next =
              sel && sel.length > 0
                ? previews.map((p) => filterPreviewByRuleSelections(p, sel))
                : previews;
            setYamlPreviews(next);
          }
        } else {
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
  }, [scenarioId, isRegistryMode, registryPayload]);

  const safeIndex = Math.min(
    selectedStep,
    Math.max(0, testCases.length - 1),
  );
  const currentTest = testCases[safeIndex];

  const totalRules = useMemo(() => {
    return yamlPreviews.reduce((acc, p) => acc + (p.rule_count ?? 0), 0);
  }, [yamlPreviews]);

  const missingYamlCount = useMemo(() => {
    return yamlPreviews.filter((p) => !p.exists).length;
  }, [yamlPreviews]);

  const handleGenerate = async () => {
    if (!Number.isFinite(scenarioId) && !isRegistryMode) return;
    setGenerating(true);
    setError(null);
    try {
      if (isRegistryMode && registryPayload) {
        // Create runtime scenario *only when user confirms generation*.
        const createdScenario = await createScenario({
          prompt: registryPayload.title,
          title: registryPayload.title,
        });
        await patchScenario(createdScenario.id, {
          title: registryPayload.title,
          steps: (registryPayload.serviceSequence ?? []).map((s, idx) => ({
            id: crypto.randomUUID(),
            number: idx + 1,
            action: s.name,
            result: "success",
            reason: `code=${s.code}`,
          })),
        });
        const created = await generateTestCases(
          createdScenario.id,
          instruction.trim() || null,
        );
        setTestCases(created);
        setSelectedStep(0);
        // Replace URL so subsequent actions work with scenarioId.
        navigate(`/test-case/${createdScenario.id}`, { replace: true });
      } else {
        const created = await generateTestCases(
          scenarioId,
          instruction.trim() || null,
        );
        setTestCases(created);
        setSelectedStep(0);
      }
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "테스트 케이스 생성에 실패했습니다.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleRunTest = async () => {
    if (!Number.isFinite(scenarioId)) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const exec = await runScenarioExecution({
        scenario_id: scenarioId,
        base_url: "",
      });
      navigate(`/execution-result/${exec.id}`);
    } catch (e) {
      setError(
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
      await downloadPostmanCollection(currentTest.id);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "내보내기에 실패했습니다.",
      );
    }
  };

  if (loading) {
    return <FinixLoadingPage label="불러오는 중…" />;
  }

  return (
    <PageShell
      icon={<Wand2 className="w-5 h-5" strokeWidth={2} />}
      title="테스트 케이스"
      description={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground">Scenario</span>
          <span className="font-medium text-foreground">
            {scenarioTitle ||
              (Number.isFinite(scenarioId) ? `#${scenarioId}` : "—")}
          </span>
        </div>
      }
      actions={
        <button
          type="button"
          onClick={() => {
            // When coming from registry, go back to registry deterministically.
            if (from) {
              navigate(from);
              return;
            }
            navigate(-1);
          }}
          className="h-9 px-3 rounded-sm border border-border bg-background text-sm font-medium hover:bg-muted transition-colors inline-flex items-center gap-2"
          title="시나리오 관리로"
        >
          <ArrowLeft className="w-4 h-4" />
          뒤로
        </button>
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
              key={tc.id}
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
                  시나리오: {scenarioTitle || `#${scenarioId}`}
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

                <div className="pt-2 flex items-center justify-end">
                  <FinixPrimaryButton
                    onClick={() => void handleGenerate()}
                    disabled={generating || yamlLoading || yamlPreviews.length === 0}
                    className="px-6 h-10 rounded-sm gap-2"
                  >
                    {generating ? (
                      <FinixLoading size="sm" inline />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    {generating ? "생성 중…" : "테스트케이스 생성"}
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
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleExportPostman()}
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    포스트맨으로 내보내기
                  </button>
                  <FinixPrimaryButton
                    onClick={() => void handleRunTest()}
                    disabled={running}
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

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      요청 데이터
                    </label>
                    <pre className="bg-secondary border border-border rounded-sm p-4 text-sm overflow-x-auto">
                      <code>
                        {JSON.stringify(currentTest.request_body, null, 2)}
                      </code>
                    </pre>
                  </div>
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
