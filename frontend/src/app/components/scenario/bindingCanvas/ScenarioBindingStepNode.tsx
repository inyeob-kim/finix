import {
  FinixFlowPill,
  FinixFlowStepCard,
} from "../../ui/finix-flow";
import { cn } from "../../ui/utils";
import type { BindingCanvasNode } from "@/lib/scenarioBindingCanvas";

type Props = {
  node: BindingCanvasNode;
  selected?: boolean;
  onSelect?: () => void;
  onOpenCollectionVars?: () => void;
  onOpenOverrides?: () => void;
};

export function ScenarioBindingStepNode({
  node,
  selected,
  onSelect,
  onOpenCollectionVars,
  onOpenOverrides,
}: Props) {
  if (node.kind === "start") {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1.5",
          selected && "ring-2 ring-primary/40 rounded-md",
        )}
      >
        <button
          type="button"
          onClick={onOpenCollectionVars ?? onSelect}
          className="text-left"
        >
          <FinixFlowPill tone="start">Start</FinixFlowPill>
        </button>
        {node.subtitle ? (
          <p className="text-[10px] text-muted-foreground">{node.subtitle}</p>
        ) : null}
      </div>
    );
  }

  if (node.kind === "end") {
    return (
      <div className="flex justify-center">
        <FinixFlowPill tone="end">End</FinixFlowPill>
      </div>
    );
  }

  if (node.kind === "dataModel") {
    return (
      <button
        type="button"
        onClick={onOpenOverrides ?? onSelect}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-dashed border-flow-data/50 bg-card px-2.5 py-1.5 text-left",
          selected && "ring-2 ring-primary/40",
        )}
      >
        <FinixFlowPill tone="data" className="px-2 py-0.5">
          Data
        </FinixFlowPill>
        <span className="text-[10px] text-muted-foreground">
          {node.subtitle ?? "고정값"}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full",
        selected && "ring-2 ring-primary/40 rounded-md",
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={onSelect}
      >
        <FinixFlowStepCard
          order={(node.stepIndex ?? 0) + 1}
          title={node.label}
          subtitle={node.subtitle}
          className="w-full min-w-0 max-w-none"
        />
      </button>
      {(node.overrideCount ?? 0) > 0 && onOpenOverrides ? (
        <div className="mt-1 flex justify-end px-0.5">
          <button
            type="button"
            onClick={onOpenOverrides}
            className="text-[10px] text-amber-700 hover:underline"
          >
            고정값 {node.overrideCount}
          </button>
        </div>
      ) : null}
    </div>
  );
}
