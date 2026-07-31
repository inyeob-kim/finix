import { useState } from "react";
import {
  formatPostmanVar,
  groupAvailablePostmanVars,
  type AvailablePostmanVar,
} from "@/lib/postmanBodyBindings";
import {
  collectionVarSourceLabel,
  type CollectionVarGeneratorId,
} from "@/lib/collectionVarGenerators";
import type { PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import { type CollectionVarDeclarePayload } from "./CollectionVarAddField";
import { CollectionVarDeclareDialog } from "./CollectionVarDeclareDialog";

type Props = {
  availableVars: AvailablePostmanVar[];
  collectionVars?: readonly PostmanStartVar[];
  onInsertVar: (name: string) => void;
  onAddCustomVar?: (payload: CollectionVarDeclarePayload) => void;
  onRemoveCustomVar?: (key: string) => void;
};

export function ScenarioStepPostmanVarBar({
  availableVars,
  collectionVars = [],
  onInsertVar,
  onAddCustomVar,
  onRemoveCustomVar,
}: Props) {
  const [declareOpen, setDeclareOpen] = useState(false);
  const varGroups = groupAvailablePostmanVars(availableVars);
  const collectionByKey = new Map(
    collectionVars.map((r) => [r.key.trim(), r] as const),
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">변수</p>
        {onAddCustomVar ? (
          <button
            type="button"
            onClick={() => setDeclareOpen(true)}
            className="text-[10px] text-primary hover:underline"
          >
            변수 추가
          </button>
        ) : null}
      </div>
      <div className="space-y-1">
        {varGroups.map((g) => (
          <div
            key={g.origin}
            className="flex flex-wrap items-center gap-1"
            title={g.detail}
          >
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              {g.origin}
            </span>
            {g.vars.map((v) => {
              const row = collectionByKey.get(v.name);
              const detail =
                g.origin === "S" && row
                  ? collectionVarSourceLabel(row)
                  : v.detail;
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onInsertVar(v.name)}
                  className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-primary hover:border-primary/40"
                  title={detail}
                >
                  {formatPostmanVar(v.name)}
                </button>
              );
            })}
          </div>
        ))}
        {varGroups.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {onAddCustomVar
              ? "없음 · 변수 추가로 컬렉션 변수를 선언하세요"
              : "없음"}
          </p>
        ) : null}
      </div>

      {onAddCustomVar ? (
        <CollectionVarDeclareDialog
          open={declareOpen}
          onOpenChange={setDeclareOpen}
          collectionVars={collectionVars}
          onAdd={onAddCustomVar}
          onRemove={onRemoveCustomVar}
        />
      ) : null}
    </div>
  );
}

export type { CollectionVarDeclarePayload, CollectionVarGeneratorId };
