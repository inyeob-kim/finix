import { useState } from "react";
import { X } from "lucide-react";
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
import { CollectionVarDeleteAlertDialog } from "./CollectionVarDeleteAlertDialog";
import { cn } from "../ui/utils";

type Props = {
  availableVars: AvailablePostmanVar[];
  collectionVars?: readonly PostmanStartVar[];
  /** Current request body draft — used to warn when deleting an in-use var. */
  bodyText?: string;
  onInsertVar: (name: string) => void;
  onAddCustomVar?: (payload: CollectionVarDeclarePayload) => void;
  onRemoveCustomVar?: (key: string) => void;
};

export function ScenarioStepPostmanVarBar({
  availableVars,
  collectionVars = [],
  bodyText = "",
  onInsertVar,
  onAddCustomVar,
  onRemoveCustomVar,
}: Props) {
  const [declareOpen, setDeclareOpen] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const varGroups = groupAvailablePostmanVars(availableVars);
  const collectionByKey = new Map(
    collectionVars.map((r) => [r.key.trim(), r] as const),
  );

  const requestRemove = (name: string) => {
    if (!onRemoveCustomVar) return;
    setPendingDeleteKey(name.trim());
  };

  const pendingToken = pendingDeleteKey
    ? formatPostmanVar(pendingDeleteKey)
    : "";
  const pendingInUse =
    pendingDeleteKey != null && bodyText.includes(pendingToken);

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
              const canRemove =
                g.origin === "S" &&
                onRemoveCustomVar != null &&
                collectionByKey.has(v.name);

              if (!canRemove) {
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
              }

              return (
                <span
                  key={v.name}
                  className={cn(
                    "group inline-flex items-center gap-0.5 rounded-sm border border-border bg-background",
                    "hover:border-primary/40 focus-within:border-primary/40",
                  )}
                  title={detail}
                >
                  <button
                    type="button"
                    onClick={() => onInsertVar(v.name)}
                    className="pl-1.5 py-0.5 font-mono text-[10px] text-primary"
                  >
                    {formatPostmanVar(v.name)}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "pr-1 py-0.5 text-muted-foreground hover:text-destructive",
                      "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      "focus-visible:opacity-100",
                    )}
                    aria-label={`${v.name} 선언 삭제`}
                    onClick={(e) => {
                      e.stopPropagation();
                      requestRemove(v.name);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </span>
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
          onRemove={onRemoveCustomVar ? requestRemove : undefined}
        />
      ) : null}

      <CollectionVarDeleteAlertDialog
        open={pendingDeleteKey != null}
        varKey={pendingDeleteKey}
        inUse={pendingInUse}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteKey(null);
        }}
        onConfirm={() => {
          if (pendingDeleteKey && onRemoveCustomVar) {
            onRemoveCustomVar(pendingDeleteKey);
          }
          setPendingDeleteKey(null);
        }}
      />
    </div>
  );
}

export type { CollectionVarDeclarePayload, CollectionVarGeneratorId };
