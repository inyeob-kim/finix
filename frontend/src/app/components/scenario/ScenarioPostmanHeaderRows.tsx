import { Plus, Trash2 } from "lucide-react";
import {
  isBxmReservedHeaderKey,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import {
  newHeaderRow,
  type PostmanHeaderRow,
} from "@/lib/scenarioPostmanHeaders";
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

  const updateRowKey = (rowId: string, key: string) => {
    if (isBxmReservedHeaderKey(key)) return;
    updateRows(
      rows.map((r) => (r.id === rowId ? { ...r, key } : r)),
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        instCd·deptId 등 채널 값은 <strong>변수</strong> 탭에서 설정하세요.{" "}
        <span className="font-mono">x-bxm-systemheader</span>는 자동 생성됩니다.
      </p>
      {!hideHeader ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">추가 헤더</span>
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
      {rows.map((row) => {
        const reserved = isBxmReservedHeaderKey(row.key.trim());
        return (
          <div key={row.id} className="flex gap-2 items-center">
            <FinixUnderlineInput
              value={row.key}
              onChange={(e) => updateRowKey(row.id, e.target.value)}
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
              placeholder="값"
              className="font-mono text-xs flex-[1.4] min-w-[6rem]"
            />
            <button
              type="button"
              className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => updateRows(rows.filter((r) => r.id !== row.id))}
              aria-label="삭제"
              disabled={row.key.trim().toLowerCase() === "content-type"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {reserved ? (
              <span className="sr-only">채널 헤더는 변수 탭 사용</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
