import { AlertTriangle, Variable } from "lucide-react";
import type { BindingReviewIssue, ScenarioVariableRow } from "@/lib/scenarioConnectionUx";

type Props = {
  variables: ScenarioVariableRow[];
  connectionCount: number;
  issueCount: number;
  issues: BindingReviewIssue[];
  onSelectStep?: (stepIndex: number) => void;
};

export function ScenarioVariablesPanel({
  variables,
  connectionCount,
  issueCount,
  issues,
  onSelectStep,
}: Props) {
  const critical = issues.filter((i) => i.kind === "orphan_inject");

  return (
    <div className="rounded-sm border border-border bg-card shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Variable className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium">시나리오 변수</span>
          <span className="text-[11px] text-muted-foreground">
            연결 {connectionCount}건
            {issueCount > 0 ? (
              <>
                {" "}
                ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  확인 {issueCount}건
                </span>
              </>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                {" "}
                · 모두 연결됨
              </span>
            )}
          </span>
        </div>
      </div>

      {critical.length > 0 ? (
        <ul className="px-3 py-2 border-b border-border space-y-1 max-h-24 overflow-y-auto">
          {critical.slice(0, 4).map((issue, i) => (
            <li key={`${issue.var}-${issue.stepIndex}-${i}`}>
              <button
                type="button"
                className="text-left text-[11px] text-amber-800 dark:text-amber-200 flex gap-1.5 w-full hover:underline"
                onClick={() => onSelectStep?.(issue.stepIndex)}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-3 py-2.5">
        {variables.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            아래에서 응답 필드를 고르면 변수가 생깁니다. «다음에 넣기»로 한 번에
            연결할 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {variables.map((row) => (
              <div
                key={row.var}
                className="inline-flex flex-col gap-0.5 rounded-sm border border-border bg-muted/20 px-2 py-1.5 max-w-[220px]"
                title={`저장: ${row.savedAt.map((s) => s.caseId).join(", ") || "—"} / 사용: ${row.usedAt.map((u) => u.caseId).join(", ") || "—"}`}
              >
                <span className="font-mono text-[11px] text-primary font-medium">
                  {row.var}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {row.savedAt.length > 0 ? (
                    <>
                      저장 ← {row.savedAt[row.savedAt.length - 1].caseId}
                    </>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      저장 없음
                    </span>
                  )}
                  {row.usedAt.length > 0 ? (
                    <>
                      {" "}
                      · 사용 → {row.usedAt[0].caseId}
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
