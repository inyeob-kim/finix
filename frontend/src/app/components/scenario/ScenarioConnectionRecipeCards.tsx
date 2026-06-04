import { ArrowRight, Link2 } from "lucide-react";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import type { ScenarioRecipeCard } from "@/lib/scenarioConnectionUx";

type Props = {
  cards: ScenarioRecipeCard[];
  activePairIndex: number | null;
  suggestedCounts?: Map<number, number>;
  onSelectPair: (pairIndex: number) => void;
};

export function ScenarioConnectionRecipeCards({
  cards,
  activePairIndex,
  suggestedCounts,
  onSelectPair,
}: Props) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-2 shrink-0">
      <p className="text-xs font-medium text-foreground px-0.5">
        단계 사이 연결 목록
        <span className="font-normal text-muted-foreground ml-1.5">
          — 수정할 구간을 클릭하세요
        </span>
      </p>
      <div className="flex flex-col gap-2 max-h-[min(28vh,240px)] overflow-y-auto pr-1">
        {cards.map((card) => {
          const isActive = activePairIndex === card.pairIndex;
          const suggested = suggestedCounts?.get(card.pairIndex) ?? 0;
          return (
            <button
              key={`${card.fromStep.stepKey}-${card.toStep.stepKey}`}
              type="button"
              onClick={() => onSelectPair(card.pairIndex)}
              className={[
                "w-full text-left rounded-sm border px-3 py-2.5 transition-colors",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background hover:bg-muted/30",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <StepLabel step={card.fromStep} />
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <StepLabel step={card.toStep} />
                {suggested > 0 && card.connections.length === 0 ? (
                  <span className="text-[10px] text-primary ml-auto">
                    제안 {suggested}건
                  </span>
                ) : null}
              </div>
              {card.connections.length === 0 ? (
                <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  아래에서 응답 필드 옆 [다음] 클릭
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {card.connections.map((c) => (
                    <li
                      key={`${c.var}-${c.responsePath}-${c.requestPath}`}
                      className="text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-1 items-center"
                    >
                      <span className="text-primary font-semibold">{c.var}</span>
                      <span className="text-foreground/70 truncate max-w-[40%]">
                        {c.responsePath}
                      </span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="text-foreground/70 truncate max-w-[40%]">
                        {c.requestPath}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepLabel({ step }: { step: ScenarioRunStep }) {
  return (
    <span className="font-mono text-primary shrink-0">
      {runStepCaseIdLabel(step)}
    </span>
  );
}
