import { Plus } from "lucide-react";
import {
  BINDING_CANVAS_DATA_ID,
  BINDING_CANVAS_END_ID,
  BINDING_CANVAS_START_ID,
  buildBindingCanvasGraph,
  type BindingCanvasEdge,
} from "@/lib/scenarioBindingCanvas";
import { START_VAR_STEP_INDEX } from "@/lib/scenarioConnectionUx";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import { FinixDotCanvas, FinixFlowPill } from "../../ui/finix-flow";
import { cn } from "../../ui/utils";
import { ScenarioBindingStepNode } from "./ScenarioBindingStepNode";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  startVarKeys: readonly string[];
  selectedEdgeId?: string | null;
  selectedStepIndex?: number | null;
  onSelectEdge: (edge: BindingCanvasEdge) => void;
  onAddLink: (seed?: {
    fromStepIndex?: number;
    toStepIndex?: number;
  }) => void;
  onOpenCollectionVars: () => void;
  onOpenOverrides: () => void;
  onSelectStep?: (stepIndex: number) => void;
};

export function ScenarioBindingCanvas({
  runSteps,
  bindings,
  startVarKeys,
  selectedEdgeId,
  selectedStepIndex,
  onSelectEdge,
  onAddLink,
  onOpenCollectionVars,
  onOpenOverrides,
  onSelectStep,
}: Props) {
  const { nodes, edges } = buildBindingCanvasGraph(
    runSteps,
    bindings,
    startVarKeys,
  );

  const startNode = nodes.find((n) => n.id === BINDING_CANVAS_START_ID);
  const endNode = nodes.find((n) => n.id === BINDING_CANVAS_END_ID);
  const dataNode = nodes.find((n) => n.id === BINDING_CANVAS_DATA_ID);
  const stepNodes = nodes.filter((n) => n.kind === "step");
  const varEdges = edges.filter((e) => e.kind === "var");
  const overrideEdges = edges.filter((e) => e.kind === "override");

  return (
    <FinixDotCanvas className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 shrink-0">
        <FinixFlowPill tone="loop">Loop</FinixFlowPill>
        <span className="text-[11px] text-muted-foreground">
          테스트 케이스 데이터 흐름
        </span>
        <button
          type="button"
          onClick={() => onAddLink()}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:border-primary/40 hover:text-primary"
        >
          <Plus className="size-3" />
          연결 추가
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col items-stretch gap-0">
          {startNode ? (
            <ScenarioBindingStepNode
              node={startNode}
              onOpenCollectionVars={onOpenCollectionVars}
              onAddLinkFrom={() =>
                onAddLink({
                  fromStepIndex: START_VAR_STEP_INDEX,
                  toStepIndex: Math.min(1, runSteps.length - 1),
                })
              }
            />
          ) : null}

          <div className="mx-auto my-1 h-5 w-px bg-primary/40" />

          {dataNode ? (
            <>
              <div className="mb-1 flex justify-center">
                <ScenarioBindingStepNode
                  node={dataNode}
                  onOpenOverrides={onOpenOverrides}
                />
              </div>
              {overrideEdges.length > 0 ? (
                <div className="mb-2 flex flex-wrap justify-center gap-1">
                  {overrideEdges.map((e) => (
                    <span
                      key={e.id}
                      className="rounded border border-dashed border-flow-data/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      → step {(e.toStepIndex ?? 0) + 1}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mx-auto my-1 h-5 w-px border-l border-dashed border-flow-data/50" />
            </>
          ) : null}

          <div className="flex flex-col gap-0 rounded-md border border-flow-loop/40 bg-card/70 p-3">
            {stepNodes.map((node, idx) => (
              <div key={node.id} className="flex flex-col">
                <ScenarioBindingStepNode
                  node={node}
                  selected={selectedStepIndex === node.stepIndex}
                  onSelect={() => {
                    if (node.stepIndex != null) onSelectStep?.(node.stepIndex);
                  }}
                  onOpenOverrides={onOpenOverrides}
                  onAddLinkFrom={() =>
                    onAddLink({
                      fromStepIndex: node.stepIndex,
                      toStepIndex: Math.min(
                        (node.stepIndex ?? 0) + 1,
                        runSteps.length - 1,
                      ),
                    })
                  }
                  onAddLinkTo={() =>
                    onAddLink({
                      fromStepIndex:
                        (node.stepIndex ?? 0) > 0
                          ? (node.stepIndex ?? 0) - 1
                          : startVarKeys.length > 0
                            ? START_VAR_STEP_INDEX
                            : 0,
                      toStepIndex: node.stepIndex,
                    })
                  }
                />
                {idx < stepNodes.length - 1 ? (
                  <div className="mx-auto my-2 flex flex-col items-center gap-1">
                    <div className="h-4 w-px bg-primary/40" />
                    {varEdges
                      .filter(
                        (e) =>
                          e.fromStepIndex === node.stepIndex &&
                          e.toStepIndex === (node.stepIndex ?? 0) + 1,
                      )
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onSelectEdge(e)}
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                            e.linked
                              ? "border-primary/30 bg-primary/5 text-primary"
                              : "border-destructive/30 bg-destructive/5 text-destructive",
                            selectedEdgeId === e.id && "ring-2 ring-primary/40",
                          )}
                        >
                          {e.varName}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {varEdges.some(
            (e) =>
              e.toStepIndex - e.fromStepIndex > 1 ||
              e.fromStepIndex === START_VAR_STEP_INDEX ||
              !e.linked ||
              (e.fromStepIndex >= 0 &&
                e.toStepIndex !== e.fromStepIndex + 1),
          ) ? (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                모든 연결
              </p>
              <ul className="space-y-1">
                {varEdges.map((e) => {
                  const fromLabel =
                    e.fromStepIndex === START_VAR_STEP_INDEX
                      ? "Start"
                      : e.fromStepIndex >= 0
                        ? `S${e.fromStepIndex + 1}`
                        : "?";
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEdge(e)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/40",
                          e.linked
                            ? "border-border bg-card"
                            : "border-destructive/30 bg-destructive/[0.03]",
                          selectedEdgeId === e.id && "ring-2 ring-primary/40",
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {fromLabel} → S{e.toStepIndex + 1}
                        </span>
                        <span className="font-mono font-medium text-foreground">
                          {e.varName}
                        </span>
                        {!e.linked ? (
                          <span className="ml-auto text-[10px] text-destructive">
                            미연결
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : varEdges.length === 0 ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              아직 변수 연결이 없습니다. 「연결 추가」로 시작하세요.
            </p>
          ) : null}

          <div className="mx-auto my-1 h-5 w-px bg-primary/40" />
          {endNode ? <ScenarioBindingStepNode node={endNode} /> : null}
        </div>
      </div>
    </FinixDotCanvas>
  );
}
