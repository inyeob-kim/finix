import { Sparkles } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
};

/** Toolbar toggle that opens the YAML edit modal's right-side macro panel. */
export function YamlInputMacroToggle({
  disabled = false,
  active = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-sm border text-xs font-medium disabled:opacity-50",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      <Sparkles className="size-3.5 text-primary" />
      동적값
    </button>
  );
}
