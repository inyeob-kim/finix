import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  emptyStepBinding,
  stripBindingPathForInput,
  type BindingExtractSpec,
  type BindingInjectSpec,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  runStepCaseIdLabel,
  runStepShortDescription,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  onChange: (next: StepBindingsByStepKey) => void;
  focusedStepIndex?: number;
  onFocusedStepChange?: (index: number) => void;
};

function updateBinding(
  bindings: StepBindingsByStepKey,
  stepKey: string,
  patch: Partial<{ extracts: BindingExtractSpec[]; injects: BindingInjectSpec[] }>,
): StepBindingsByStepKey {
  const cur = bindings[stepKey] ?? emptyStepBinding();
  return {
    ...bindings,
    [stepKey]: {
      extracts: patch.extracts ?? cur.extracts,
      injects: patch.injects ?? cur.injects,
    },
  };
}

export function ScenarioStepBindingsEditor({
  runSteps,
  bindings,
  onChange,
  focusedStepIndex = 0,
  onFocusedStepChange,
}: Props) {
  if (runSteps.length < 2) {
    return (
      <p className="text-xs text-muted-foreground rounded-sm border border-dashed border-border px-3 py-3">
        테스트 케이스를 2개 이상 선택하면 단계 간 변수 연결(extract / inject)을 설정할 수 있습니다.
      </p>
    );
  }

  const safeFocus = Math.min(focusedStepIndex, runSteps.length - 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-0.5">
        오른쪽에서 필드를 클릭하면 여기 규칙이 채워집니다. 직접 수정해도 됩니다.
      </p>

      {runSteps.map((step, idx) => {
        const cfg = bindings[step.stepKey] ?? emptyStepBinding();
        const isOpen = idx === safeFocus;
        const extractN = cfg.extracts.filter((r) => r.var.trim()).length;
        const injectN = cfg.injects.filter((r) => r.var.trim()).length;

        return (
          <div
            key={step.stepKey}
            className={[
              "rounded-sm border overflow-hidden transition-colors",
              isOpen ? "border-primary/40 bg-card" : "border-border bg-card/50",
            ].join(" ")}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
              onClick={() => onFocusedStepChange?.(idx)}
            >
              <div className="min-w-0">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {step.order}
                </span>
                <span className="text-xs font-mono text-primary ml-1.5">
                  {runStepCaseIdLabel(step)}
                </span>
                <p className="text-[11px] text-foreground mt-0.5 line-clamp-2">
                  {runStepShortDescription(step) || step.title}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {step.serviceCode}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {idx === 0 ? "응답 추출" : "주입 + 응답 추출"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {injectN > 0 || extractN > 0 ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {injectN > 0 ? `inject ${injectN}` : ""}
                    {injectN > 0 && extractN > 0 ? " · " : ""}
                    {extractN > 0 ? `extract ${extractN}` : ""}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">미설정</span>
                )}
                <ChevronDown
                  className={[
                    "w-4 h-4 text-muted-foreground transition-transform",
                    isOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </div>
            </button>

            {isOpen ? (
              <div className="px-3 pb-3 pt-4 space-y-4 border-t border-border">
                {idx > 0 ? (
                  <BindingRows
                    title="Inject — 이전 단계 변수 → 요청 body"
                    hint="이전 단계 extract한 변수명과 동일하게"
                    rows={cfg.injects}
                    varPlaceholder="accountNo"
                    pathPlaceholder="accountNo"
                    onChange={(injects) =>
                      onChange(updateBinding(bindings, step.stepKey, { injects }))
                    }
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    첫 단계는 inject 없이 응답에서만 추출합니다.
                  </p>
                )}

                <BindingRows
                  title="Extract — 응답에서 저장"
                  hint="다음 단계에서 쓸 변수 이름"
                  rows={cfg.extracts}
                  varPlaceholder="token"
                  pathPlaceholder="data.token"
                  onChange={(extracts) =>
                    onChange(updateBinding(bindings, step.stepKey, { extracts }))
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function JsonPathInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  const display = stripBindingPathForInput(value);
  return (
    <div className="flex h-8 min-w-0 rounded-sm border border-border bg-background overflow-hidden focus-within:ring-1 focus-within:ring-primary/30">
      <span className="inline-flex items-center px-2 text-xs font-mono text-muted-foreground bg-muted/50 border-r border-border shrink-0 select-none">
        $.
      </span>
      <input
        className="flex-1 min-w-0 h-full px-2 text-xs font-mono bg-transparent outline-none"
        placeholder={placeholder}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

function BindingRows({
  title,
  hint,
  rows,
  varPlaceholder,
  pathPlaceholder,
  onChange,
}: {
  title: string;
  hint: string;
  rows: BindingExtractSpec[] | BindingInjectSpec[];
  varPlaceholder: string;
  pathPlaceholder: string;
  onChange: (rows: BindingExtractSpec[]) => void;
}) {
  const add = () => onChange([...rows, { var: "", json_path: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const patch = (i: number, field: "var" | "json_path", value: string) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-medium text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-sm border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={add}
        >
          <Plus className="w-3 h-3 inline mr-1" />
          규칙 추가
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[5.5rem_1fr_2rem] gap-1.5 text-[10px] text-muted-foreground px-0.5">
            <span>변수</span>
            <span>JSON 경로</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[5.5rem_1fr_2rem] gap-1.5 items-center"
            >
              <input
                className="h-8 rounded-sm border border-border bg-background px-2 text-xs font-mono"
                placeholder={varPlaceholder}
                value={row.var}
                onChange={(e) => patch(i, "var", e.target.value)}
              />
              <JsonPathInput
                placeholder={pathPlaceholder}
                value={row.json_path}
                onChange={(v) => patch(i, "json_path", v)}
              />
              <button
                type="button"
                className="h-8 w-8 inline-flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="삭제"
                onClick={() => remove(i)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
            onClick={add}
          >
            <Plus className="w-3 h-3" />
            행 추가
          </button>
        </div>
      )}
    </div>
  );
}
