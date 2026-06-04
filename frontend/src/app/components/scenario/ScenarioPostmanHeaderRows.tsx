import { Plus, Trash2 } from "lucide-react";
import { newHeaderRow, type PostmanHeaderRow } from "@/lib/scenarioPostmanHeaders";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { FinixUnderlineInput } from "../ui/finix-form";

type Props = {
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  hideHeader?: boolean;
};

export function ScenarioPostmanHeaderRows({
  config,
  onChange,
  hideHeader = false,
}: Props) {
  const rows = config.defaultHeaders ?? [];

  const updateRows = (nextRows: PostmanHeaderRow[]) => {
    onChange({ ...config, defaultHeaders: nextRows });
  };

  const addRow = () => {
    updateRows([...rows, newHeaderRow()]);
  };

  return (
    <div className="space-y-2">
      {!hideHeader ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">기본 헤더</span>
          <button
            type="button"
            className="inline-flex items-center gap-0.5 h-7 px-2 rounded-sm border border-border text-[11px] font-medium text-primary hover:bg-primary/10"
            onClick={addRow}
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </button>
        </div>
      ) : null}
      {rows.map((row) => (
        <div key={row.id} className="flex gap-2 items-center">
          <FinixUnderlineInput
            value={row.key}
            onChange={(e) =>
              updateRows(
                rows.map((r) =>
                  r.id === row.id ? { ...r, key: e.target.value } : r,
                ),
              )
            }
            placeholder="헤더명"
            className="font-mono text-xs flex-1 min-w-[5rem]"
          />
          <FinixUnderlineInput
            value={row.value}
            onChange={(e) =>
              updateRows(
                rows.map((r) =>
                  r.id === row.id ? { ...r, value: e.target.value } : r,
                ),
              )
            }
            placeholder="{{변수}} 또는 값"
            className="font-mono text-xs flex-[1.4] min-w-[6rem]"
          />
          <button
            type="button"
            className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => updateRows(rows.filter((r) => r.id !== row.id))}
            aria-label="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
