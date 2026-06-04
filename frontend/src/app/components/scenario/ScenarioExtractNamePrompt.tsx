import { FinixUnderlineInput } from "../ui/finix-form";
import { cn } from "../ui/utils";

type Props = {
  defaultVar: string;
  conflictVar: string;
  conflictStepLabel: string;
  suggestions: string[];
  draftVar: string;
  onDraftVarChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
  headline?: string;
  hint?: string;
  confirmLabel?: string;
};

export function ScenarioExtractNamePrompt({
  defaultVar,
  conflictVar,
  conflictStepLabel,
  suggestions,
  draftVar,
  onDraftVarChange,
  onConfirm,
  onCancel,
  error,
  headline,
  hint,
  confirmLabel = "등록",
}: Props) {
  return (
    <div className="rounded-sm border border-amber-500/40 bg-amber-500/[0.06] p-2 space-y-2">
      {headline ? (
        <p className="text-[11px] font-medium text-foreground">{headline}</p>
      ) : (
        <p className="text-[11px] text-foreground">
          <span className="font-mono text-primary">{conflictVar}</span>
          는 {conflictStepLabel}에서 이미 사용 중입니다.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        {hint ?? `다른 변수명을 지정하세요 (기본 필드명: ${defaultVar})`}
      </p>
      <FinixUnderlineInput
        value={draftVar}
        onChange={(e) => onDraftVarChange(e.target.value)}
        placeholder="예: fromAcctNo"
        className="font-mono text-xs"
        autoFocus
      />
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded-sm border border-border",
                "hover:border-primary/40 hover:bg-primary/10",
                draftVar.trim() === name && "border-primary bg-primary/10 text-primary",
              )}
              onClick={() => onDraftVarChange(name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="h-7 px-2.5 rounded-sm bg-primary/90 text-primary-foreground text-[11px] font-medium hover:bg-primary"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="h-7 px-2.5 rounded-sm border border-border text-[11px] hover:bg-muted"
          onClick={onCancel}
        >
          취소
        </button>
      </div>
    </div>
  );
}
