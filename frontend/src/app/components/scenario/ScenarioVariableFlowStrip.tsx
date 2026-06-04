import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ArrowRight, ChevronDown, Link2Off } from "lucide-react";
import {
  buildVariableFlowLanes,
  countLinkedConnections,
  type VariableFlowLane,
} from "@/lib/scenarioConnectionUx";
import { runStepCaseIdLabel, type ScenarioRunStep } from "@/lib/scenarioRunSequence";
import type { StepBindingsByStepKey } from "@/lib/scenarioBindings";
import {
  clearAllScenarioBindings,
  clearInjectsOnly,
  countBindingStats,
} from "@/lib/scenarioBindingClear";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";

type ConfirmMode = "all" | "injects-only";

type Props = {
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  startVarKeys?: string[];
  onBindingsChange: Dispatch<SetStateAction<StepBindingsByStepKey>>;
  onFocusStep?: (stepIndex: number) => void;
};

function StatusChip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "success" | "warn" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium border tabular-nums",
        tone === "success" &&
          "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        tone === "warn" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
        tone === "muted" && "border-border/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function LaneRow({
  lane,
  runSteps,
  onFocusStep,
}: {
  lane: VariableFlowLane;
  runSteps: ScenarioRunStep[];
  onFocusStep?: (stepIndex: number) => void;
}) {
  const fromLabel =
    lane.fromStepIndex >= 0
      ? runStepCaseIdLabel(runSteps[lane.fromStepIndex])
      : "?";

  return (
    <button
      type="button"
      onClick={() => {
        const target =
          lane.hops.find((h) => !h.linked)?.toStepIndex ??
          lane.hops[lane.hops.length - 1]?.toStepIndex ??
          lane.fromStepIndex;
        if (target >= 0) onFocusStep?.(target);
        else if (lane.fromStepIndex >= 0) onFocusStep?.(lane.fromStepIndex);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] font-mono",
        "hover:bg-muted/60 transition-colors max-w-full",
        lane.hops.length === 0 || lane.hops.every((h) => h.linked)
          ? "border-emerald-500/35 bg-emerald-500/[0.06]"
          : "border-amber-500/40 bg-amber-500/[0.06]",
      )}
    >
      <span className="text-muted-foreground tabular-nums shrink-0">
        [{lane.fromStepIndex >= 0 ? lane.fromStepIndex + 1 : "?"}]
      </span>
      <span className="text-primary font-semibold shrink-0">{lane.var}</span>
      {lane.hops.length === 0 ? (
        <span className="text-muted-foreground font-sans text-[9px] shrink-0">
          · {fromLabel}
        </span>
      ) : (
        lane.hops.map((hop) => (
          <span key={hop.toStepIndex} className="inline-flex items-center gap-0.5 shrink-0">
            <ArrowRight
              className={cn(
                "w-3 h-3",
                hop.linked ? "text-emerald-600" : "text-amber-600",
              )}
            />
            <span className="text-muted-foreground tabular-nums">
              [{hop.toStepIndex + 1}]
            </span>
          </span>
        ))
      )}
    </button>
  );
}

export function ScenarioVariableFlowStrip({
  runSteps,
  bindings,
  startVarKeys = [],
  onBindingsChange,
  onFocusStep,
}: Props) {
  const lanes = buildVariableFlowLanes(runSteps, bindings);
  const stats = useMemo(
    () => countBindingStats(runSteps, bindings),
    [runSteps, bindings],
  );
  const linkStats = useMemo(
    () => countLinkedConnections(runSteps, bindings, startVarKeys),
    [runSteps, bindings, startVarKeys],
  );
  const hasBindingsToClear = stats.extractCount + stats.injectCount > 0;
  const pending = linkStats.orphanInjects + linkStats.savedOnlyExtracts;

  const [confirmMode, setConfirmMode] = useState<ConfirmMode | null>(null);
  const [clearOverrides, setClearOverrides] = useState(false);
  const [busy, setBusy] = useState(false);

  const closeDialog = () => {
    if (busy) return;
    setConfirmMode(null);
    setClearOverrides(false);
  };

  const applyClear = () => {
    if (!confirmMode) return;
    setBusy(true);
    try {
      if (confirmMode === "injects-only") {
        onBindingsChange((prev) => clearInjectsOnly(runSteps, prev));
      } else {
        onBindingsChange((prev) =>
          clearAllScenarioBindings(runSteps, prev, { clearOverrides }),
        );
      }
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  if (runSteps.length === 0) return null;

  const hasLanes = lanes.length > 0;

  return (
    <>
      <div className="rounded-sm border border-border bg-card shrink-0">
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-2.5 py-2",
            hasLanes && "border-b border-border",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium text-foreground shrink-0">
              변수 흐름
            </span>
            {linkStats.linked > 0 ? (
              <StatusChip tone="success">연결 {linkStats.linked}건</StatusChip>
            ) : hasBindingsToClear ? (
              <StatusChip tone="warn">
                설정 중 ↑{stats.extractCount} · ↓{stats.injectCount}
              </StatusChip>
            ) : (
              <StatusChip>연결 없음</StatusChip>
            )}
            {pending > 0 ? (
              <StatusChip tone="warn">미완료 {pending}</StatusChip>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={!hasBindingsToClear}
                className={cn(
                  "shrink-0 h-7 px-2 rounded-sm border border-border bg-background text-[11px] font-medium",
                  "inline-flex items-center gap-1 hover:bg-muted disabled:opacity-40",
                )}
              >
                <Link2Off className="w-3.5 h-3.5" />
                연결 해제
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem
                disabled={stats.injectCount === 0}
                onSelect={() => setConfirmMode("injects-only")}
              >
                요청 연결만 전체 해제
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasBindingsToClear}
                onSelect={() => setConfirmMode("all")}
              >
                연결 전체 초기화
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasLanes ? (
          <div className="px-2.5 py-1.5">
            <p className="text-[9px] text-muted-foreground mb-1">
              클릭 시 해당 단계로 이동
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lanes.map((lane) => (
                <LaneRow
                  key={lane.var}
                  lane={lane}
                  runSteps={runSteps}
                  onFocusStep={onFocusStep}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={confirmMode !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="w-full max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">
              {confirmMode === "injects-only"
                ? "요청 연결만 해제"
                : "연결 전체 초기화"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                {confirmMode === "injects-only" ? (
                  <p>
                    모든 단계의 <span className="font-medium">↓ 요청 inject</span>{" "}
                    {stats.injectCount}건을 해제합니다. ↑ 응답 변수(extract)는
                    그대로 둡니다.
                  </p>
                ) : (
                  <>
                    <p>시나리오 전체의 연결을 지웁니다.</p>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>응답 변수(extract) {stats.extractCount}건</li>
                      <li>요청 연결(inject) {stats.injectCount}건</li>
                      {stats.overrideCount > 0 ? (
                        <li>body 고정값(override) {stats.overrideCount}건</li>
                      ) : null}
                    </ul>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {confirmMode === "all" && stats.overrideCount > 0 ? (
            <label className="flex items-start gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={clearOverrides}
                onChange={(e) => setClearOverrides(e.target.checked)}
                disabled={busy}
              />
              <span>
                body 고정값(override) {stats.overrideCount}건도 함께 삭제
              </span>
            </label>
          ) : null}

          {busy ? (
            <div className="py-4">
              <FinixLoading size="md" center label="연결 해제 중…" />
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closeDialog}
              disabled={busy}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={applyClear}
              disabled={busy || confirmMode === null}
              className="h-9 px-4 w-auto rounded-sm"
            >
              해제
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
