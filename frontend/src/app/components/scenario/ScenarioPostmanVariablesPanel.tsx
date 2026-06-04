import { Plus, Trash2 } from "lucide-react";
import type { ScenarioPostmanConfig, PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import {
  buildPostmanVariablePreview,
  collectExtractVarPreviews,
  newStartVar,
} from "@/lib/scenarioPostmanVariables";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import { FinixField, FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  onGoRuntime?: () => void;
};

function StartVarRow({
  row,
  onChange,
  onRemove,
}: {
  row: PostmanStartVar;
  onChange: (next: PostmanStartVar) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
      <FinixUnderlineInput
        value={row.key}
        onChange={(e) => onChange({ ...row, key: e.target.value })}
        placeholder="변수명 (예: custId)"
        className="font-mono text-xs"
      />
      <FinixUnderlineInput
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        placeholder="초기값"
        className="font-mono text-xs"
      />
      <button
        type="button"
        className="p-2 rounded-sm text-muted-foreground hover:text-destructive hover:bg-muted"
        onClick={onRemove}
        aria-label="삭제"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ScenarioPostmanVariablesPanel({
  runSteps,
  bindings,
  config,
  onChange,
  onGoRuntime,
}: Props) {
  const extractVars = collectExtractVarPreviews(runSteps, bindings);
  const preview = buildPostmanVariablePreview(config, extractVars);
  const missingBaseUrl = !config.baseUrl.trim();

  const updateStartVar = (id: string, next: PostmanStartVar) => {
    onChange({
      ...config,
      startVars: config.startVars.map((r) => (r.id === id ? next : r)),
    });
  };

  const removeStartVar = (id: string) => {
    onChange({
      ...config,
      startVars: config.startVars.filter((r) => r.id !== id),
    });
  };

  return (
    <div className="space-y-4 pb-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Postman 컬렉션에 들어갈 변수입니다. import 후{" "}
        <span className="font-medium text-foreground">Environment 없이</span>{" "}
        Collection Variables만으로 실행할 수 있습니다.
      </p>

      <section className="rounded-sm border border-border bg-card/40 p-3 space-y-2">
        <p className="text-[11px] font-medium text-foreground">기본 설정</p>
        <FinixField
          label="baseUrl"
          helperText="모든 요청 URL 앞에 붙습니다 (예: https://api.example.com)"
        >
          <FinixUnderlineInput
            value={config.baseUrl}
            onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
            placeholder="https://localhost:8080"
            className="font-mono text-xs"
          />
        </FinixField>
        {missingBaseUrl ? (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            baseUrl을 입력하면 Postman에서 바로 실행하기 쉽습니다.
          </p>
        ) : null}
      </section>

      <section className="rounded-sm border border-border bg-card/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-foreground">컬렉션 변수</p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            onClick={() =>
              onChange({ ...config, startVars: [...config.startVars, newStartVar()] })
            }
          >
            <Plus className="w-3 h-3" />
            추가
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          1번 API 실행 전부터 값이 있어야 하는 변수 (고객번호 등)
        </p>
        {config.startVars.length === 0 ? (
          <p className="text-[10px] text-muted-foreground border border-dashed rounded-sm px-2 py-3 text-center">
            필요할 때만 추가하세요. 없어도 export는 가능합니다.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] text-muted-foreground px-0.5">
              <span>변수명</span>
              <span>초기값</span>
              <span className="w-8" />
            </div>
            {config.startVars.map((row) => (
              <StartVarRow
                key={row.id}
                row={row}
                onChange={(next) => updateStartVar(row.id, next)}
                onRemove={() => removeStartVar(row.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-sm border border-border bg-muted/20 p-3 space-y-2">
        <p className="text-[11px] font-medium text-foreground">
          실행 중 채워지는 변수
        </p>
        <p className="text-[10px] text-muted-foreground">
          「런타임 흐름」에서 응답→변수로 등록한 항목이 자동으로 포함됩니다.
        </p>
        {extractVars.length === 0 ? (
          <div className="text-[10px] text-muted-foreground border border-dashed rounded-sm px-2 py-3 text-center space-y-1">
            <p>아직 없습니다.</p>
            {onGoRuntime ? (
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={onGoRuntime}
              >
                런타임 흐름에서 변수 만들기 →
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {extractVars.map((ex) => (
              <span
                key={ex.var}
                className="inline-flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-900 dark:text-emerald-200"
                title={`[${ex.stepIndex + 1}] ${ex.caseLabel}`}
              >
                {ex.var}
                <span className="font-sans text-muted-foreground">
                  ← [{ex.stepIndex + 1}]
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {preview.length > 0 ? (
        <section className="rounded-sm border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
          <p className="text-[11px] font-medium text-foreground">
            Postman 미리보기 ({preview.length})
          </p>
          <ul className="space-y-1">
            {preview.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between gap-2 text-[10px] font-mono"
              >
                <span className="text-primary">{row.key}</span>
                <span
                  className={cn(
                    "truncate max-w-[55%] text-right",
                    row.value ? "text-foreground" : "text-muted-foreground italic",
                  )}
                >
                  {row.value || "(빈 값)"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
