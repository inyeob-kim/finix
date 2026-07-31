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
  onOpenCollectionVars: () => void;
  onOpenOverrides: (stepIndex?: number) => void;
  onSelectStep?: (stepIndex: number) => void;
};

export function ScenarioBindingCanvas({
  runSteps,
  bindings,
  startVarKeys,
  selectedEdgeId,
  selectedStepIndex,
  onSelectEdge,
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
        <FinixFlowPill tone="loop">시나리오 흐름</FinixFlowPill>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col items-stretch gap-0">
          {startNode ? (
            <ScenarioBindingStepNode
              node={startNode}
              onOpenCollectionVars={onOpenCollectionVars}
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
                      → TC{(e.toStepIndex ?? 0) + 1}
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
                  onOpenOverrides={() => onOpenOverrides(node.stepIndex)}
                />
                {idx < stepNodes.length - 1 ? (
                  <div className="mx-auto my-2 h-4 w-px bg-primary/40" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mx-auto my-1 h-5 w-px bg-primary/40" />
          {endNode ? <ScenarioBindingStepNode node={endNode} /> : null}

          {varEdges.length > 0 ? (
            <div className="mt-3 rounded-md border border-border bg-card p-3 space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                모든 연결
                <span className="ml-1 tabular-nums normal-case tracking-normal">
                  ({varEdges.length})
                </span>
              </p>
              <ul className="space-y-1">
                {varEdges.map((e) => {
                  const fromLabel =
                    e.fromStepIndex === START_VAR_STEP_INDEX
                      ? "Start"
                      : e.fromStepIndex >= 0
                        ? `TC${e.fromStepIndex + 1}`
                        : "?";
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEdge(e)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/40",
                          e.linked
                            ? "border-border bg-background"
                            : "border-destructive/30 bg-destructive/[0.03]",
                          selectedEdgeId === e.id && "ring-2 ring-primary/40",
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {fromLabel} → TC{e.toStepIndex + 1}
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
          ) : null}
        </div>
      </div>
    </FinixDotCanvas>
  );
}
