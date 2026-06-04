import { useState } from "react";
import type { ResolvedTestCaseStepDto } from "@/api/types";

type BodyTab = "template" | "resolved" | "context";

type Props = {
  templateBody: Record<string, unknown>;
  resolvedRow: ResolvedTestCaseStepDto | null;
  contextAfter: Record<string, unknown> | null;
  injectWarnings?: string[];
};

export function ScenarioRequestBodyPanel({
  templateBody,
  resolvedRow,
  contextAfter,
  injectWarnings = [],
}: Props) {
  const hasResolved =
    resolvedRow != null &&
    JSON.stringify(resolvedRow.resolved_request_body) !==
      JSON.stringify(templateBody);
  const [tab, setTab] = useState<BodyTab>(hasResolved ? "resolved" : "template");

  const tabs: { id: BodyTab; label: string; hint: string }[] = [
    { id: "template", label: "템플릿", hint: "YAML 풀에서 materialize된 기본 body" },
    {
      id: "resolved",
      label: "실행 시 반영",
      hint: "bindings 적용 후 실제 전송 body",
    },
    { id: "context", label: "컨텍스트", hint: "이 단계까지의 extract 변수" },
  ];

  const body =
    tab === "template"
      ? templateBody
      : tab === "resolved"
        ? (resolvedRow?.resolved_request_body ?? templateBody)
        : (contextAfter ?? {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "h-8 px-3 rounded-sm border text-xs font-medium transition-colors",
              tab === t.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted",
            ].join(" ")}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-1">
          {tabs.find((t) => t.id === tab)?.hint}
        </span>
      </div>

      {(injectWarnings.length > 0 || (resolvedRow?.inject_warnings?.length ?? 0) > 0) &&
      tab === "resolved" ? (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {[...injectWarnings, ...(resolvedRow?.inject_warnings ?? [])].map(
            (w) => (
              <div key={w}>{w}</div>
            ),
          )}
        </div>
      ) : null}

      <pre className="bg-secondary border border-border rounded-sm p-4 text-sm overflow-x-auto max-h-[min(420px,50vh)]">
        <code>{JSON.stringify(body, null, 2)}</code>
      </pre>
    </div>
  );
}
