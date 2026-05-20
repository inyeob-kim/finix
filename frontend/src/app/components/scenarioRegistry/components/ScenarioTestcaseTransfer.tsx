import type { DragEvent } from "react";
import { ChevronLeft, ChevronsLeft, ChevronsRight } from "lucide-react";
import { FinixLoading } from "../../ui/finix-loading";
import type { ScenarioRuleTestcaseRef } from "../types";

type ScenarioTestcaseTransferProps = {
  leftRulePool: ScenarioRuleTestcaseRef[];
  selectedRulePicks: ScenarioRuleTestcaseRef[];
  rulePickLoading: boolean;
  hasServices: boolean;
  activeServiceCode?: string | null;
  onAdd: (row: ScenarioRuleTestcaseRef) => void;
  onRemove: (id: string) => void;
  onAddAll: () => void;
  onRemoveAll: () => void;
  parseDragRuleId: (e: DragEvent) => string | null;
};

const BTN_TRANSFER =
  "inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40 disabled:pointer-events-none";

function TestcasePickRow({
  row,
  onClick,
  variant,
}: {
  row: ScenarioRuleTestcaseRef;
  onClick: () => void;
  variant: "pool" | "selected";
}) {
  return (
    <li>
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/json",
            JSON.stringify({ id: row.id }),
          );
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={onClick}
        className={
          variant === "pool"
            ? "w-full text-left rounded-sm border border-transparent hover:border-border hover:bg-muted/50 px-2 py-2 text-xs"
            : "w-full text-left rounded-sm border border-border bg-background px-2 py-2 text-xs hover:bg-muted/40"
        }
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[11px] text-primary shrink-0">
            {row.serviceCode}
          </span>
          {variant === "selected" ? (
            <ChevronLeft className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          ) : row.ruleType ? (
            <span className="text-[10px] uppercase text-muted-foreground shrink-0">
              {row.ruleType}
            </span>
          ) : null}
        </div>
        <div className="font-medium text-foreground mt-0.5 line-clamp-2">
          {row.title}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
          {row.ruleId?.trim()
            ? row.ruleId
            : row.backendTestcaseId != null
              ? `id=${row.backendTestcaseId}`
              : "—"}
        </div>
      </button>
    </li>
  );
}

export function ScenarioTestcaseTransfer({
  leftRulePool,
  selectedRulePicks,
  rulePickLoading,
  hasServices,
  activeServiceCode,
  onAdd,
  onRemove,
  onAddAll,
  onRemoveAll,
  parseDragRuleId,
}: ScenarioTestcaseTransferProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-[min(360px,42vh)]">
      <div
        className="rounded-sm border border-border bg-card/40 flex flex-col flex-1 min-h-[200px] min-w-0"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = parseDragRuleId(e);
          if (id) onRemove(id);
        }}
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-2">
          <span>
            테스트 케이스 후보
            {activeServiceCode ? (
              <span className="font-mono font-normal text-primary ml-1">
                · {activeServiceCode}
              </span>
            ) : null}
          </span>
          <span className="font-normal tabular-nums">{leftRulePool.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {rulePickLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <FinixLoading size="sm" label="목록 불러오는 중…" inline />
            </div>
          ) : leftRulePool.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              {!hasServices
                ? "먼저 서비스를 추가하세요."
                : activeServiceCode
                  ? `${activeServiceCode}에 적재된 후보가 없거나 모두 포함되었습니다. (시퀀스에서 서비스는 유지됩니다)`
                  : "시퀀스에서 서비스를 클릭해 후보를 필터하세요."}
            </p>
          ) : (
            <ul className="space-y-1">
              {leftRulePool.map((r) => (
                <TestcasePickRow
                  key={r.id}
                  row={r}
                  variant="pool"
                  onClick={() => onAdd(r)}
                />
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
          클릭·드래그로 포함 · 가운데 버튼으로 일괄 추가
        </p>
      </div>

      <div className="flex lg:flex-col items-center justify-center gap-2 shrink-0 py-1">
        <button
          type="button"
          className={BTN_TRANSFER}
          title="후보 전체 포함"
          aria-label="후보 전체 포함"
          disabled={rulePickLoading || leftRulePool.length === 0}
          onClick={onAddAll}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={BTN_TRANSFER}
          title="포함 목록 전체 제거"
          aria-label="포함 목록 전체 제거"
          disabled={selectedRulePicks.length === 0}
          onClick={onRemoveAll}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>

      <div
        className="rounded-sm border border-dashed border-primary/25 bg-primary/[0.03] flex flex-col flex-1 min-h-[200px] min-w-0"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = parseDragRuleId(e);
          const row = leftRulePool.find((x) => x.id === id);
          if (row) onAdd(row);
        }}
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-2">
          <span>시나리오에 포함</span>
          <span className="font-normal tabular-nums">{selectedRulePicks.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {selectedRulePicks.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              왼쪽에서 선택하거나 가운데 「전체 포함」을 누르세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {selectedRulePicks.map((r) => (
                <TestcasePickRow
                  key={r.id}
                  row={r}
                  variant="selected"
                  onClick={() => onRemove(r.id)}
                />
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
          클릭·드래그로 제외 · 가운데 버튼으로 일괄 제거
        </p>
      </div>
    </div>
  );
}
