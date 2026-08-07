import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pencil, X } from "lucide-react";
import type { ScenarioRegistryItem } from "../types";
import {
  countBindingRows,
  type StepBindingConfig,
} from "@/lib/scenarioBindings";
import {
  buildRunStepsFromPicks,
  runStepCaseIdLabel,
  runStepShortDescription,
  serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import { FINIX_STANDARD_SHEET_CONTENT } from "@/lib/finixModalLayout";
import {
  ensurePostmanConfig,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { FinixPrimaryButton } from "../../ui/finix-button";
import {
  FinixDotCanvas,
  FinixFlowPill,
  FinixFlowStepCard,
} from "../../ui/finix-flow";
import { FinixScenarioStatusBadge, FinixStatusBadge } from "../../ui/finix-status-badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../ui/sheet";
import { cn } from "../../ui/utils";
import {
  resolveScenarioSaveStatus,
  scenarioSaveStatusToBadge,
} from "../wizardPersist";

type DetailSection =
  | "overview"
  | "cases"
  | "flow"
  | "bindings"
  | "runtime";

const SECTION_ITEMS: Array<{ id: DetailSection; label: string }> = [
  { id: "overview", label: "기본 정보" },
  { id: "cases", label: "테스트케이스 목록" },
  { id: "flow", label: "실행 흐름" },
  { id: "bindings", label: "단계 연결" },
  { id: "runtime", label: "실행 설정" },
];

type ScenarioDetailSheetProps = {
  open: boolean;
  scenario: ScenarioRegistryItem | null;
  folderLabel?: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: string) => void;
};

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-sm text-foreground break-words",
          mono && "font-mono text-xs",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function SectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function BindingBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ primary: string; secondary: string }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">
        {title} ({rows.length})
      </p>
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li
            key={`${row.primary}-${row.secondary}-${i}`}
            className="rounded-sm border border-border bg-muted/20 px-2.5 py-1.5 text-[11px]"
          >
            <span className="font-mono text-foreground">{row.primary}</span>
            <span className="text-muted-foreground mx-1.5">→</span>
            <span className="font-mono text-muted-foreground break-all">
              {row.secondary}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatOverrideValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function VarTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; value?: string; description?: string | null }>;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground mb-2">
        {title}{" "}
        <span className="tabular-nums text-muted-foreground font-normal">
          ({rows.length})
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">없음</p>
      ) : (
        <div className="rounded-sm border border-border overflow-hidden">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">키</th>
                <th className="px-2.5 py-1.5 font-medium">값</th>
                <th className="px-2.5 py-1.5 font-medium">설명</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-2.5 py-1.5 font-mono text-foreground align-top">
                    {row.key}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-muted-foreground align-top break-all">
                    {row.value?.trim() ? row.value : "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-muted-foreground align-top">
                    {row.description?.trim() || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ScenarioDetailSheet({
  open,
  scenario,
  folderLabel,
  onOpenChange,
  onEdit,
}: ScenarioDetailSheetProps) {
  const [section, setSection] = useState<DetailSection>("overview");

  useEffect(() => {
    if (open) setSection("overview");
  }, [open, scenario?.id]);

  const picks = scenario?.selectedRuleTestcases ?? [];
  const steps = useMemo(
    () =>
      scenario
        ? buildRunStepsFromPicks(
            picks,
            serviceNameMapFromDrafts(scenario.serviceSequence ?? []),
          )
        : [],
    [scenario, picks],
  );

  const bindingCount = scenario
    ? countBindingRows(
        scenario.stepBindingsByStepKey ?? scenario.stepBindingsByCode,
      )
    : 0;

  const saveStatus = scenario ? resolveScenarioSaveStatus(scenario) : "ready";
  const bindings =
    scenario?.stepBindingsByStepKey ?? scenario?.stepBindingsByCode ?? {};
  const postman: ScenarioPostmanConfig = ensurePostmanConfig(
    scenario?.postmanConfig,
  );

  const serviceCaseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const pick of picks) {
      const code = pick.serviceCode;
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return map;
  }, [picks]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={FINIX_STANDARD_SHEET_CONTENT}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0 text-left space-y-1">
          <p className="text-[11px] text-muted-foreground">시나리오 상세</p>
          <SheetTitle className="pr-10 text-lg font-semibold leading-snug">
            {scenario?.title ?? "시나리오"}
          </SheetTitle>
          {scenario ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <FinixScenarioStatusBadge
                status={scenarioSaveStatusToBadge(saveStatus)}
              />
              <span className="text-[11px] text-muted-foreground tabular-nums">
                TC {picks.length} · 연결 {bindingCount} · 서비스{" "}
                {(scenario.serviceSequence ?? []).length}
              </span>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <nav
            aria-label="시나리오 상세 메뉴"
            className="w-[12rem] shrink-0 border-r border-border bg-muted/15 px-2 py-3 overflow-y-auto"
          >
            <ul className="space-y-0.5">
              {SECTION_ITEMS.map((item) => {
                const active = section === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      className={cn(
                        "w-full text-left rounded-full px-3 py-2 text-xs font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">
            {!scenario ? (
              <p className="text-sm text-muted-foreground">
                시나리오를 선택하세요.
              </p>
            ) : section === "overview" ? (
              <div className="space-y-5 max-w-3xl">
                <SectionTitle
                  title="기본 정보"
                  hint="시나리오 메타데이터와 구성 요약입니다."
                />
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="제목">{scenario.title}</Field>
                  <Field label="상태">
                    <FinixScenarioStatusBadge
                      status={scenarioSaveStatusToBadge(saveStatus)}
                    />
                    {saveStatus === "draft" && scenario.wizardStep ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        마법사 {scenario.wizardStep}/3 단계에 임시저장
                      </span>
                    ) : null}
                  </Field>
                  <Field label="컬렉션">
                    {folderLabel?.trim() || "—"}
                  </Field>
                  <Field label="로컬 ID" mono>
                    {scenario.id}
                  </Field>
                  <Field label="백엔드 시나리오 ID" mono>
                    {scenario.backendScenarioId != null
                      ? String(scenario.backendScenarioId)
                      : "미동기화"}
                  </Field>
                  <Field label="태그">
                    {(scenario.tags ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {scenario.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex rounded-sm border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field label="생성">
                    {scenario.createdAt}
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="font-mono text-xs">{scenario.updatedBy}</span>
                  </Field>
                  <Field label="최종 수정">
                    {scenario.updatedAt}
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="font-mono text-xs">{scenario.updatedBy}</span>
                  </Field>
                </dl>

                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">설명</p>
                  <div className="rounded-sm border border-border bg-muted/20 px-3 py-2.5 text-sm whitespace-pre-wrap text-foreground min-h-[4rem]">
                    {scenario.description?.trim() || (
                      <span className="text-muted-foreground">설명 없음</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "테스트케이스", value: picks.length },
                    {
                      label: "서비스",
                      value: (scenario.serviceSequence ?? []).length,
                    },
                    { label: "단계 연결", value: bindingCount },
                    {
                      label: "시작 변수",
                      value: postman.startVars.filter((v) => v.key.trim())
                        .length,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-sm border border-border px-3 py-2.5"
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {(scenario.serviceSequence ?? []).length > 0 ? (
                  <div>
                    <p className="text-xs font-medium mb-2">서비스 구성</p>
                    <ol className="space-y-1.5">
                      {scenario.serviceSequence.map((s, i) => (
                        <li
                          key={`${s.code}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="text-muted-foreground tabular-nums mr-2">
                              {i + 1}.
                            </span>
                            <span className="font-mono text-foreground">
                              {s.code}
                            </span>
                            {s.name ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {s.name}
                              </span>
                            ) : null}
                          </div>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            TC {serviceCaseCounts.get(s.code) ?? 0}건
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : section === "cases" ? (
              <div className="space-y-4 max-w-4xl">
                <SectionTitle
                  title="테스트케이스 목록"
                  hint="시나리오에 고정된 테스트케이스입니다. 핀 버전이 있으면 실행 시 해당 스냅샷을 사용합니다."
                />
                {picks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    선택된 테스트케이스가 없습니다.
                  </p>
                ) : (
                  <div className="rounded-sm border border-border overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium w-10">#</th>
                          <th className="px-3 py-2 font-medium w-12">유형</th>
                          <th className="px-3 py-2 font-medium">케이스</th>
                          <th className="px-3 py-2 font-medium">서비스</th>
                          <th className="px-3 py-2 font-medium">핀 버전</th>
                        </tr>
                      </thead>
                      <tbody>
                        {picks.map((pick, idx) => {
                          const caseId = pick.ruleId?.trim() || "—";
                          const ruleType = (pick.ruleType || "").toUpperCase();
                          return (
                            <tr
                              key={pick.id}
                              className="border-t border-border align-top"
                            >
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2.5">
                                {ruleType === "N" || ruleType === "E" ? (
                                  <FinixStatusBadge
                                    tone={
                                      ruleType === "E" ? "danger" : "success"
                                    }
                                  >
                                    {ruleType}
                                  </FinixStatusBadge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-mono text-foreground">
                                  {caseId}
                                </p>
                                <p className="mt-0.5 text-muted-foreground leading-snug">
                                  {pick.title?.trim() || "제목 없음"}
                                </p>
                                {pick.description?.trim() ? (
                                  <p className="mt-0.5 text-[11px] text-muted-foreground/80 line-clamp-2">
                                    {pick.description}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-mono">{pick.serviceCode}</p>
                                {pick.serviceName &&
                                pick.serviceName !== pick.serviceCode ? (
                                  <p className="mt-0.5 text-muted-foreground">
                                    {pick.serviceName}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums font-mono text-muted-foreground">
                                {pick.tcHistVersion != null
                                  ? `v${pick.tcHistVersion}`
                                  : "미핀"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : section === "flow" ? (
              <div className="space-y-4 max-w-xl">
                <SectionTitle
                  title="실행 흐름"
                  hint="시나리오 실행 시 테스트케이스가 호출되는 순서입니다."
                />
                <FinixDotCanvas className="p-4">
                  {steps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      표시할 흐름이 없습니다.
                    </p>
                  ) : (
                    <div className="flex flex-col items-stretch gap-0">
                      <div className="flex justify-center">
                        <FinixFlowPill tone="start">Start</FinixFlowPill>
                      </div>
                      <div className="mx-auto my-1 h-5 w-px bg-primary/50" />
                      <div className="flex flex-col items-stretch gap-0 rounded-md border border-flow-loop/40 bg-card/70 p-3">
                        {steps.map((step, idx) => {
                          const pick = picks[idx];
                          const binding = bindings[step.stepKey] as
                            | StepBindingConfig
                            | undefined;
                          const linkCount =
                            (binding?.extracts?.length ?? 0) +
                            (binding?.injects?.length ?? 0) +
                            (binding?.overrides?.length ?? 0);
                          return (
                            <div
                              key={step.stepKey}
                              className="flex flex-col items-stretch"
                            >
                              <FinixFlowStepCard
                                order={`TC${idx + 1}`}
                                title={runStepCaseIdLabel(step)}
                                subtitle={[
                                  runStepShortDescription(step) ||
                                    step.title?.trim() ||
                                    step.serviceCode,
                                  pick?.tcHistVersion != null
                                    ? `핀 v${pick.tcHistVersion}`
                                    : null,
                                  linkCount > 0
                                    ? `연결 ${linkCount}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                className="w-full min-w-0 max-w-none"
                              />
                              {idx < steps.length - 1 ? (
                                <div className="mx-auto my-2 h-5 w-px shrink-0 bg-primary/40" />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mx-auto my-1 h-5 w-px bg-primary/50" />
                      <div className="flex justify-center">
                        <FinixFlowPill tone="end">End</FinixFlowPill>
                      </div>
                    </div>
                  )}
                </FinixDotCanvas>
              </div>
            ) : section === "bindings" ? (
              <div className="space-y-4 max-w-3xl">
                <SectionTitle
                  title="단계 연결"
                  hint="응답에서 뽑아(extract) 다음 요청에 넣는(inject) 변수와, 고정값 override입니다."
                />
                {bindingCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    설정된 단계 연결이 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {steps.map((step, idx) => {
                      const block = (bindings[step.stepKey] ??
                        bindings[step.serviceCode]) as
                        | StepBindingConfig
                        | undefined;
                      if (!block) return null;
                      const extracts = block.extracts ?? [];
                      const injects = block.injects ?? [];
                      const overrides = block.overrides ?? [];
                      const total =
                        extracts.length + injects.length + overrides.length;
                      if (total === 0) return null;
                      return (
                        <li
                          key={step.stepKey}
                          className="rounded-sm border border-border px-3 py-3"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              TC{idx + 1}
                            </span>
                            <span className="font-mono text-sm text-foreground">
                              {runStepCaseIdLabel(step)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {step.serviceCode}
                            </span>
                          </div>
                          <BindingBlock
                            title="extract"
                            rows={extracts.map((r) => ({
                              primary: r.var,
                              secondary: r.json_path,
                            }))}
                          />
                          <BindingBlock
                            title="inject"
                            rows={injects.map((r) => ({
                              primary: r.var,
                              secondary: r.json_path,
                            }))}
                          />
                          <BindingBlock
                            title="override"
                            rows={overrides.map((r) => ({
                              primary: r.json_path,
                              secondary: formatOverrideValue(r.value),
                            }))}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-5 max-w-3xl">
                <SectionTitle
                  title="실행 설정"
                  hint="시나리오 실행·Postman보내기에 쓰이는 baseUrl과 변수입니다."
                />
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="baseUrl" mono>
                    {postman.baseUrl.trim() || "—"}
                  </Field>
                  <Field label="기본 헤더">
                    {postman.defaultHeaders.filter((h) => h.key.trim()).length}
                    건
                  </Field>
                </dl>
                <VarTable title="채널/헤더 변수" rows={postman.headerVars} />
                <VarTable title="시작 변수" rows={postman.startVars} />
                <VarTable
                  title="기본 헤더"
                  rows={postman.defaultHeaders.map((h) => ({
                    key: h.key,
                    value: h.value,
                    description: null,
                  }))}
                />
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-row flex-wrap justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted inline-flex items-center gap-1.5"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-3.5 h-3.5" />
            닫기
          </button>
          <FinixPrimaryButton
            type="button"
            className="h-9 px-3 w-auto rounded-sm text-sm"
            disabled={!scenario}
            onClick={() => {
              if (!scenario) return;
              onEdit(scenario.id);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            수정
          </FinixPrimaryButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
