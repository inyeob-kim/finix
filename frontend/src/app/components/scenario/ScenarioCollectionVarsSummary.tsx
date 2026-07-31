import { ChevronRight, Settings2 } from "lucide-react";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { cn } from "../ui/utils";

type Props = {
  config: ScenarioPostmanConfig;
  onManage: () => void;
};

export function ScenarioCollectionVarsSummary({ config, onManage }: Props) {
  void config;

  return (
    <button
      type="button"
      onClick={onManage}
      className={cn(
        "w-full flex items-center gap-2 rounded-sm border border-border bg-card px-2.5 py-2",
        "text-left transition-colors hover:bg-muted/40 hover:border-primary/30",
      )}
    >
      <Settings2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="text-xs font-medium text-foreground flex-1 min-w-0">
        헤더 설정
      </span>
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
        설정
      </span>
      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
