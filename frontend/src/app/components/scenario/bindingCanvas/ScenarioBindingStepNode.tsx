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
};

export function ScenarioBindingStepNode({
  node,
  selected,
  onSelect,
  onOpenCollectionVars,
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
          order={`TC${(node.stepIndex ?? 0) + 1}`}
          title={node.label}
          subtitle={node.subtitle}
          headerRight={node.versionLabel}
          className="w-full min-w-0 max-w-none"
        />
      </button>
    </div>
  );
}
