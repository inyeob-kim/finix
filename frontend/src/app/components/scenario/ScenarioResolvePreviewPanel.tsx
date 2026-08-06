import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { resolveScenarioPreviewInline } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import type {
  ScenarioResolvePreviewDto,
  ScenarioStepDto,
  TestCaseRefDto,
} from "@/api/types";
import type { ServiceCatalogItem } from "../scenarioRegistry/types";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  steps: ScenarioStepDto[];
  perStep: TestCaseRefDto[][];
  serviceSequence: ServiceCatalogItem[];
  activeStepIndex: number;
  onActiveStepChange: (index: number) => void;
  enabled?: boolean;
};

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function diffInjectedKeys(
  template: Record<string, unknown>,
  resolved: Record<string, unknown>,
): string[] {
  const keys: string[] = [];
  const walk = (a: unknown, b: unknown, prefix: string) => {
    if (a === b) return;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
      if (prefix) keys.push(prefix);
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b) && prefix) keys.push(prefix);
      return;
    }
    const ak = a as Record<string, unknown>;
    const bk = b as Record<string, unknown>;
    const names = new Set([...Object.keys(ak), ...Object.keys(bk)]);
    for (const k of names) {
      const p = prefix ? `${prefix}.${k}` : k;
      walk(ak[k], bk[k], p);
    }
  };
  walk(template, resolved, "");
  return keys.slice(0, 12);
}

export function ScenarioResolvePreviewPanel({
  steps,
  perStep,
  serviceSequence,
  activeStepIndex,
  onActiveStepChange,
  enabled = true,
}: Props) {
  const [preview, setPreview] = useState<ScenarioResolvePreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);

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
        e instanceof ApiError ? e.message : "미리보기를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, steps, perStep]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 400);
    return () => window.clearTimeout(t);
  }, [load]);

  const stepsByLogical = useMemo(() => {
    if (!preview) return new Map<number, typeof preview.steps>();
    const map = new Map<number, typeof preview.steps>();
    for (const row of preview.steps) {
      const list = map.get(row.step_index) ?? [];
      list.push(row);
      map.set(row.step_index, list);
    }
    return map;
  }, [preview]);

  const activeRows = stepsByLogical.get(activeStepIndex) ?? [];
  const activeSvc = serviceSequence[activeStepIndex];
  const warnings = [
    ...(preview?.global_warnings ?? []),
    ...activeRows.flatMap((s) => s.inject_warnings),
  ];

  const contextEntries = Object.entries(preview?.context_after ?? {});

  return (
    <div className="rounded-sm border border-border bg-muted/15 flex flex-col h-full min-h-[280px]">
      <div className="flex items-start justify-between gap-2 px-3 py-3 border-b border-border shrink-0">
        <div>
          <div className="text-sm font-medium">실행 시 요청 미리보기</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            선택한 테스트 케이스에 inject가 적용된 body입니다.
          </p>
        </div>
        <button
          type="button"
          className="h-8 w-8 rounded-sm border border-border bg-background hover:bg-muted inline-flex items-center justify-center shrink-0"
          onClick={() => void load()}
          disabled={loading}
          title="다시 계산"
        >
          {loading ? (
            <FinixLoading size="sm" inline />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5 shrink-0">
        {serviceSequence.map((s, idx) => {
          const count = perStep[idx]?.length ?? 0;
          return (
            <button
              key={s.code}
              type="button"
              disabled={count === 0}
              onClick={() => onActiveStepChange(idx)}
              className={[
                "h-7 px-2 rounded-sm text-[11px] font-mono border transition-colors",
                idx === activeStepIndex
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
                count === 0 ? "opacity-40 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {idx + 1} {s.code}
              {count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {error ? (
          <div className="text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {!perStep.some((r) => r.length > 0) ? (
          <p className="text-xs text-muted-foreground">
            1단계에서 테스트 케이스를 오른쪽으로 옮기면 여기서 단계별로 확인할 수
            있습니다.
          </p>
        ) : loading && !preview ? (
          <FinixLoading size="sm" inline label="계산 중…" />
        ) : activeRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {activeSvc?.code ?? "이 단계"}에 선택된 테스트 케이스가 없습니다.
          </p>
        ) : (
          activeRows.map((row) => {
            const changed = diffInjectedKeys(
              row.template_request_body,
              row.resolved_request_body,
            );
            return (
              <div
                key={`${row.svc_code}/${row.rule_case_id}`}
                className="rounded-sm border border-border bg-background overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium line-clamp-2">{row.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {row.method ?? "—"} {row.endpoint ?? ""}
                  </div>
                </div>
                {changed.length > 0 ? (
                  <div className="px-3 py-1.5 text-[10px] text-amber-800 dark:text-amber-200 bg-amber-500/5 border-b border-border">
                    inject 반영: {changed.join(", ")}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50"
                  onClick={() => setShowTemplate((v) => !v)}
                >
                  <span>템플릿 body 보기</span>
                  {showTemplate ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {showTemplate ? (
                  <pre className="px-3 pb-2 text-[10px] leading-relaxed overflow-x-auto max-h-32 text-muted-foreground">
                    <code>{prettyJson(row.template_request_body)}</code>
                  </pre>
                ) : null}
                <div className="px-3 py-2">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1">
                    실행 시 body
                  </div>
                  <pre className="text-[11px] leading-relaxed overflow-x-auto max-h-[min(220px,28vh)] bg-secondary/80 border border-border rounded-sm p-2">
                    <code>{prettyJson(row.resolved_request_body)}</code>
                  </pre>
                </div>
              </div>
            );
          })
        )}

        {warnings.length > 0 ? (
          <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs space-y-1">
            {warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        ) : null}

        {contextEntries.length > 0 ? (
          <div className="rounded-sm border border-border bg-background px-3 py-2">
            <div className="text-[10px] font-medium text-muted-foreground mb-1.5">
              지금까지 쌓인 변수 (컨텍스트)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contextEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono"
                  title={prettyJson(v)}
                >
                  <span className="text-primary">{k}</span>
                  <span className="text-muted-foreground truncate max-w-[8rem]">
                    = {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
