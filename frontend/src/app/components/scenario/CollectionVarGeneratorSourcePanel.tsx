import { useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import {
  isEditableGeneratorKind,
  parseGeneratorSource,
  renderGeneratorSource,
} from "@/lib/collectionVarGeneratorSource";
import { GeneratorSourceCodeEditor } from "./GeneratorSourceCodeEditor";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Built-in kinds are view-only unless allowEdit. */
  readOnly?: boolean;
  implKind: string;
  impl: Record<string, unknown>;
  onChange?: (next: {
    impl_kind: string;
    impl: Record<string, unknown>;
  }) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
};

export function CollectionVarGeneratorSourcePanel({
  open,
  onOpenChange,
  readOnly = false,
  implKind,
  impl,
  onChange,
  onSave,
  saving = false,
  error = null,
}: Props) {
  const canEdit = !readOnly && isEditableGeneratorKind(implKind);
  const [code, setCode] = useState(() =>
    renderGeneratorSource({ impl_kind: implKind, impl }),
  );
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(renderGeneratorSource({ impl_kind: implKind, impl }));
    setParseError(null);
  }, [open, implKind, JSON.stringify(impl)]);

  const applyCode = (raw: string) => {
    setCode(raw);
    if (!canEdit || !onChange) return;
    const parsed = parseGeneratorSource(raw, implKind);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setParseError(null);
    onChange(parsed.spec);
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className={cn(
          "h-7 px-2 rounded-sm border text-[11px] font-medium inline-flex items-center gap-1",
          open
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        onClick={() => onOpenChange(!open)}
      >
        <Code2 className="size-3.5" />
        {open ? "소스 닫기" : "소스 보기"}
      </button>

      {open ? (
        <div className="space-y-2 rounded-sm border border-border bg-muted/20 p-2.5">
          <p className="text-[11px] text-muted-foreground">
            실행 시 서버가 평가하는 생성 로직(Python)입니다.
            {canEdit
              ? " 상단 설정 상수만 수정하세요."
              : " 이 종류는 읽기 전용입니다."}
          </p>
          <GeneratorSourceCodeEditor
            value={code}
            readOnly={!canEdit}
            height={canEdit ? "240px" : "280px"}
            onChange={canEdit ? applyCode : undefined}
          />
          {parseError || error ? (
            <p className="text-[11px] text-destructive">{parseError || error}</p>
          ) : null}
          {canEdit && onSave ? (
            <button
              type="button"
              disabled={saving || !!parseError}
              className="h-8 px-3 rounded-sm border border-primary/40 text-xs font-medium hover:bg-primary/10 disabled:opacity-40"
              onClick={() => void onSave()}
            >
              {saving ? "저장 중…" : "소스 적용 · 저장"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
