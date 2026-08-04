import { useState } from "react";
import { Plus } from "lucide-react";
import {
  COLLECTION_VAR_GENERATORS,
  type CollectionVarGeneratorId,
} from "@/lib/collectionVarGenerators";

const CUSTOM_VAR_KEY_RE = /^[A-Za-z_][\w]*$/;

export function isValidCollectionVarKey(key: string): boolean {
  return CUSTOM_VAR_KEY_RE.test(key.trim());
}

export type CollectionVarDeclarePayload = {
  key: string;
  value: string;
  /** Builtin or shared catalog key; null = literal. */
  generator: string | null;
};

type Mode = "literal" | CollectionVarGeneratorId;

type Props = {
  onSubmit: (payload: CollectionVarDeclarePayload) => void;
};

/** @deprecated Prefer CollectionVarDeclareDialog modal. */
export function CollectionVarAddField({ onSubmit }: Props) {
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<Mode>("literal");
  const [literalValue, setLiteralValue] = useState("");

  const generator = mode === "literal" ? null : mode;
  const canSubmit =
    isValidCollectionVarKey(key) &&
    (generator != null || literalValue.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      key: key.trim(),
      value: generator ? "" : literalValue.trim(),
      generator,
    });
    setKey("");
    setLiteralValue("");
    setMode("literal");
  };

  return (
    <div className="w-full space-y-1.5 rounded-sm border border-dashed border-border bg-background/80 p-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
          {"{{"}
        </span>
        <input
          className="h-7 min-w-[5.5rem] flex-1 rounded-sm border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/30"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="변수명"
          spellCheck={false}
          aria-label="컬렉션 변수명"
        />
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
          {"}}"}
        </span>
        <select
          className="h-7 max-w-[9rem] rounded-sm border border-border bg-background px-1.5 text-[10px] outline-none focus:ring-1 focus:ring-primary/30"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          aria-label="값 출처"
        >
          <option value="literal">고정값</option>
          {COLLECTION_VAR_GENERATORS.map((g) => (
            <option key={g.id} value={g.id} title={g.hint}>
              {g.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
          disabled={!canSubmit}
          onClick={submit}
          aria-label="컬렉션 변수 추가"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {mode === "literal" ? (
        <input
          className="h-7 w-full rounded-sm border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/30"
          value={literalValue}
          onChange={(e) => setLiteralValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="고정값 입력"
          spellCheck={false}
          aria-label="컬렉션 변수 고정값"
        />
      ) : (
        <p className="text-[10px] text-muted-foreground px-0.5">
          {COLLECTION_VAR_GENERATORS.find((g) => g.id === mode)?.hint}
          {" · 실행 시 1회 생성"}
        </p>
      )}
    </div>
  );
}
