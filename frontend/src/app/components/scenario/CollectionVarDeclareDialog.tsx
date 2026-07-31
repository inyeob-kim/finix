import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  COLLECTION_VAR_GENERATORS,
  collectionVarSourceLabel,
  type CollectionVarGeneratorId,
} from "@/lib/collectionVarGenerators";
import { formatPostmanVar } from "@/lib/postmanBodyBindings";
import type { PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixUnderlineInput } from "../ui/finix-form";
import {
  isValidCollectionVarKey,
  type CollectionVarDeclarePayload,
} from "./CollectionVarAddField";

type Mode = "literal" | CollectionVarGeneratorId;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionVars: readonly PostmanStartVar[];
  onAdd: (payload: CollectionVarDeclarePayload) => void;
  onRemove?: (key: string) => void;
};

export function CollectionVarDeclareDialog({
  open,
  onOpenChange,
  collectionVars,
  onAdd,
  onRemove,
}: Props) {
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<Mode>("literal");
  const [literalValue, setLiteralValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setKey("");
    setMode("literal");
    setLiteralValue("");
  }, [open]);

  const generator = mode === "literal" ? null : mode;
  const canSubmit =
    isValidCollectionVarKey(key) &&
    (generator != null || literalValue.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    onAdd({
      key: key.trim(),
      value: generator ? "" : literalValue.trim(),
      generator,
    });
    setKey("");
    setLiteralValue("");
    setMode("literal");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md rounded-sm flex flex-col gap-0 p-0 overflow-hidden max-h-[min(560px,88vh)]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="pr-8">컬렉션 변수 추가</DialogTitle>
          <DialogDescription>
            시나리오 전역에서 쓰는 변수입니다. 고정값을 넣거나 내장 동적 생성을
            선택하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 space-y-4">
          <section className="space-y-2">
            <label className="text-xs font-medium">변수명</label>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs text-muted-foreground">
                {"{{"}
              </span>
              <FinixUnderlineInput
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="custRrn"
                className="font-mono text-xs flex-1"
                spellCheck={false}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {"}}"}
              </span>
            </div>
          </section>

          <section className="space-y-2">
            <label className="text-xs font-medium">값 출처</label>
            <select
              className="h-9 w-full rounded-sm border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary/30"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="literal">고정값</option>
              {COLLECTION_VAR_GENERATORS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            {mode === "literal" ? (
              <FinixUnderlineInput
                value={literalValue}
                onChange={(e) => setLiteralValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="고정값 입력"
                className="font-mono text-xs"
                spellCheck={false}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {COLLECTION_VAR_GENERATORS.find((g) => g.id === mode)?.hint}
                {" · Live·Export 시 시나리오당 1회 생성"}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium">
              등록된 변수
              {collectionVars.length > 0 ? ` (${collectionVars.length})` : ""}
            </h3>
            {collectionVars.length === 0 ? (
              <p className="text-[11px] text-muted-foreground border border-dashed rounded-sm px-2.5 py-2">
                아직 없습니다.
              </p>
            ) : (
              <ul className="space-y-1 border border-border/60 rounded-sm divide-y divide-border/60">
                {collectionVars.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] min-w-0"
                  >
                    <span className="font-mono text-primary shrink-0">
                      {formatPostmanVar(row.key)}
                    </span>
                    <span className="text-muted-foreground truncate min-w-0 flex-1">
                      {collectionVarSourceLabel(row)}
                    </span>
                    {onRemove ? (
                      <button
                        type="button"
                        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => onRemove(row.key)}
                        aria-label={`${row.key} 삭제`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2 border-t border-border gap-2">
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="h-9 px-4 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            onClick={submit}
          >
            추가
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
