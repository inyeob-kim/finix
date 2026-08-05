import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
} from "lucide-react";
import {
  countScenarioCaseTypes,
  filterScenarioCaseType,
  resolveScenarioCaseType,
  selectedCaseTypeSummary,
  type ScenarioCaseType,
  type ScenarioCaseTypeFilter,
} from "@/lib/scenarioCaseTypeFilter";
import type { PoolCaseLiveHealth } from "@/lib/poolCaseLiveRef";
import { isBlockingLiveStatus } from "@/lib/poolCaseLiveRef";
import { FinixLoading } from "../../ui/finix-loading";
import { FinixStatusBadge } from "../../ui/finix-status-badge";
import {
  countPicksBySourceKey,
  scenarioPickOccurrence,
  scenarioPickSourceKey,
} from "@/lib/scenarioPickInstance";
import { cn } from "../../ui/utils";
import type { ScenarioRuleTestcaseRef } from "../types";

type DragSource = "pool" | "selected";

type ScenarioTestcaseTransferProps = {
  leftRulePool: ScenarioRuleTestcaseRef[];
  selectedRulePicks: ScenarioRuleTestcaseRef[];
  rulePickLoading: boolean;
  hasServices: boolean;
  activeServiceCode?: string | null;
  pickHealthById?: Record<string, PoolCaseLiveHealth>;
  onAcknowledgePick?: (id: string) => void;
  onAdd: (row: ScenarioRuleTestcaseRef) => void;
  onRemove: (id: string) => void;
  onReorder: (dragIndex: number, hoverIndex: number) => void;
  onAddByCaseType: (caseType: ScenarioCaseType | "all") => void;
  onRemoveAll: () => void;
  parseDragRuleId: (e: DragEvent) => string | null;
};

const BTN_TRANSFER =
  "inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40 disabled:pointer-events-none";

const BTN_BULK =
  "inline-flex items-center justify-center min-h-9 px-2 rounded-sm border border-border bg-background text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap";

function CaseTypeBadge({ caseType }: { caseType: ScenarioCaseType }) {
  return (
    <FinixStatusBadge tone={caseType === "E" ? "danger" : "success"}>
      {caseType}
    </FinixStatusBadge>
  );
}

function FilterSegment({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 min-w-0 rounded-sm px-2 py-1 text-[10px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm border border-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function parseDragPayload(
  e: DragEvent,
): { id: string; from: DragSource } | null {
  try {
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return null;
    const o = JSON.parse(raw) as { id?: string; from?: string };
    if (typeof o.id !== "string" || !o.id) return null;
    const from: DragSource = o.from === "selected" ? "selected" : "pool";
    return { id: o.id, from };
  } catch {
    return null;
  }
}

function TestcasePickRow({
  row,
  onClick,
  variant,
  index,
  onReorder,
  includeCount,
  occurrence,
  duplicateTotal,
  health,
  onAcknowledge,
}: {
  row: ScenarioRuleTestcaseRef;
  onClick: () => void;
  variant: "pool" | "selected";
  index?: number;
  onReorder?: (dragIndex: number, hoverIndex: number) => void;
  includeCount?: number;
  occurrence?: number;
  duplicateTotal?: number;
  health?: PoolCaseLiveHealth;
  onAcknowledge?: () => void;
}) {
  const caseType = resolveScenarioCaseType(row);
  const from: DragSource = variant === "selected" ? "selected" : "pool";
  const showOccurrence =
    variant === "selected" &&
    occurrence != null &&
    duplicateTotal != null &&
    duplicateTotal > 1;
  const warn =
    variant === "selected" && health && isBlockingLiveStatus(health.status);

  return (
    <li
      onDragOver={
        variant === "selected" && onReorder != null && index != null
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        variant === "selected" && onReorder != null && index != null
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              const payload = parseDragPayload(e);
              if (!payload || payload.from !== "selected") return;
              const fromIdx = Number(e.dataTransfer.getData("text/plain"));
              if (!Number.isFinite(fromIdx) || fromIdx < 0) return;
              if (fromIdx === index) return;
              onReorder(fromIdx, index);
            }
          : undefined
      }
    >
      <div
        className={cn(
          "rounded-sm border px-2 py-2 text-xs",
          variant === "pool"
            ? "border-transparent hover:border-border hover:bg-muted/50"
            : warn
              ? "border-destructive/40 bg-destructive/[0.04]"
              : "border-border bg-background hover:bg-muted/40",
        )}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({ id: row.id, from }),
            );
            if (variant === "selected" && index != null) {
              e.dataTransfer.setData("text/plain", String(index));
            }
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={onClick}
          className="w-full text-left"
        >
          <div className="flex items-center gap-1">
            {variant === "selected" ? (
              <span
                className="shrink-0 self-center text-muted-foreground cursor-grab active:cursor-grabbing"
                title="드래그로 순서 변경"
                aria-hidden
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[11px] text-primary shrink-0 min-w-0 truncate">
                  {row.ruleId?.trim()
                    ? row.ruleId
                    : row.backendTestcaseId != null
                      ? `#${row.backendTestcaseId}`
                      : row.serviceCode}
                  {showOccurrence ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {occurrence}회
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {warn ? (
                    <span
                      className="inline-flex text-destructive"
                      title={health?.message}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                    </span>
                  ) : null}
                  {variant === "pool" &&
                  includeCount != null &&
                  includeCount > 0 ? (
                    <span
                      className="rounded-sm border border-border px-1 py-0.5 text-[9px] tabular-nums text-muted-foreground"
                      title="시나리오에 포함된 횟수 · 다시 클릭하면 추가"
                    >
                      {includeCount}
                    </span>
                  ) : null}
                  <CaseTypeBadge caseType={caseType} />
                  {variant === "selected" ? (
                    <ChevronLeft className="w-3 h-3 text-muted-foreground mt-0.5" />
                  ) : null}
                </div>
              </div>
              <div className="font-medium text-foreground mt-0.5 line-clamp-2">
                {row.description?.trim() || row.title}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {row.serviceCode}
              </div>
            </div>
          </div>
        </button>
        {warn ? (
          <div className="mt-1.5 flex items-start justify-between gap-2 pl-5">
            <p className="text-[10px] text-destructive leading-snug">
              {health?.message}
            </p>
            {health?.status === "changed" && onAcknowledge ? (
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-foreground hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge();
                }}
              >
                <Check className="w-3 h-3" />
                확인
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ScenarioTestcaseTransfer({
  leftRulePool,
  selectedRulePicks,
  rulePickLoading,
  hasServices,
  activeServiceCode,
  pickHealthById,
  onAcknowledgePick,
  onAdd,
  onRemove,
  onReorder,
  onAddByCaseType,
  onRemoveAll,
  parseDragRuleId,
}: ScenarioTestcaseTransferProps) {
  const [caseTypeFilter, setCaseTypeFilter] =
    useState<ScenarioCaseTypeFilter>("all");

  const poolCounts = useMemo(
    () => countScenarioCaseTypes(leftRulePool),
    [leftRulePool],
  );
  const filteredPool = useMemo(
    () => filterScenarioCaseType(leftRulePool, caseTypeFilter),
    [leftRulePool, caseTypeFilter],
  );
  const selectedSummary = useMemo(
    () => selectedCaseTypeSummary(selectedRulePicks),
    [selectedRulePicks],
  );
  const includeCounts = useMemo(
    () => countPicksBySourceKey(selectedRulePicks),
    [selectedRulePicks],
  );

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
          const payload = parseDragPayload(e);
          if (payload?.from === "selected") {
            onRemove(payload.id);
            return;
          }
          const id = payload?.id ?? parseDragRuleId(e);
          if (id) onRemove(id);
        }}
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between gap-2">
            <span>
              테스트 케이스 후보
              {activeServiceCode ? (
                <span className="font-mono font-normal text-primary ml-1">
                  · {activeServiceCode}
                </span>
              ) : null}
            </span>
            <span className="font-normal tabular-nums">{poolCounts.all}</span>
          </div>
          <div className="flex gap-1 rounded-sm bg-muted/50 p-0.5">
            <FilterSegment
              active={caseTypeFilter === "all"}
              label="전체"
              count={poolCounts.all}
              onClick={() => setCaseTypeFilter("all")}
            />
            <FilterSegment
              active={caseTypeFilter === "N"}
              label="N"
              count={poolCounts.N}
              onClick={() => setCaseTypeFilter("N")}
            />
            <FilterSegment
              active={caseTypeFilter === "E"}
              label="E"
              count={poolCounts.E}
              onClick={() => setCaseTypeFilter("E")}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {rulePickLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <FinixLoading size="sm" label="목록 불러오는 중…" inline />
            </div>
          ) : filteredPool.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              {!hasServices
                ? "먼저 서비스를 추가하세요."
                : activeServiceCode
                  ? caseTypeFilter === "all"
                    ? `${activeServiceCode}에 적재된 후보가 없습니다.`
                    : `${activeServiceCode} · ${caseTypeFilter} 후보가 없습니다.`
                  : "시퀀스에서 서비스를 클릭해 후보를 필터하세요."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredPool.map((r) => (
                <TestcasePickRow
                  key={r.id}
                  row={r}
                  variant="pool"
                  includeCount={includeCounts.get(scenarioPickSourceKey(r)) ?? 0}
                  onClick={() => onAdd(r)}
                />
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
          클릭·드래그로 포함(같은 TC 여러 번 가능) · 가운데 버튼은 아직 없는
          케이스만 일괄 추가
        </p>
      </div>

      <div className="flex lg:flex-col items-center justify-center gap-2 shrink-0 py-1">
        <button
          type="button"
          className={BTN_BULK}
          title="Normal 케이스만 포함"
          disabled={rulePickLoading || poolCounts.N === 0}
          onClick={() => onAddByCaseType("N")}
        >
          N만
        </button>
        <button
          type="button"
          className={BTN_BULK}
          title="Error 케이스만 포함"
          disabled={rulePickLoading || poolCounts.E === 0}
          onClick={() => onAddByCaseType("E")}
        >
          E만
        </button>
        <button
          type="button"
          className={BTN_TRANSFER}
          title="후보 전체 포함"
          aria-label="후보 전체 포함"
          disabled={rulePickLoading || leftRulePool.length === 0}
          onClick={() => onAddByCaseType("all")}
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
          const payload = parseDragPayload(e);
          if (payload?.from === "selected") {
            return;
          }
          const id = payload?.id ?? parseDragRuleId(e);
          const row = leftRulePool.find((x) => x.id === id);
          if (row) onAdd(row);
        }}
      >
        <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-2">
          <span>시나리오에 포함</span>
          <span className="font-normal tabular-nums text-[10px]">
            {selectedRulePicks.length}
            {selectedSummary ? (
              <span className="text-muted-foreground ml-1">({selectedSummary})</span>
            ) : null}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-0">
          {selectedRulePicks.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-6 text-center">
              왼쪽에서 선택하거나 가운데 「N만 / E만 / 전체」를 누르세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {selectedRulePicks.map((r, index) => {
                const sourceKey = scenarioPickSourceKey(r);
                const duplicateTotal = includeCounts.get(sourceKey) ?? 1;
                return (
                  <TestcasePickRow
                    key={r.id}
                    row={r}
                    variant="selected"
                    index={index}
                    occurrence={scenarioPickOccurrence(selectedRulePicks, index)}
                    duplicateTotal={duplicateTotal}
                    onReorder={onReorder}
                    onClick={() => onRemove(r.id)}
                    health={pickHealthById?.[r.id]}
                    onAcknowledge={
                      onAcknowledgePick
                        ? () => onAcknowledgePick(r.id)
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
          드래그로 순서 변경 · 클릭·왼쪽으로 드래그해 제외
        </p>
      </div>
    </div>
  );
}
