import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import { getServiceCatalogDtoSkeletons } from "@/api/serviceCatalogApi";
import type { ServiceCatalogDtoSkeletonsDto } from "@/api/types";
import { ApiError } from "@/api/client";
import {
  priorStepInjectVariables,
  sortConnectedFirst,
  startInjectVariables,
  type RuntimeVariableEntry,
} from "@/lib/scenarioConnectionUx";
import {
  emptyStepBinding,
  findInjectRequestPath,
  isInjectConnectedAtPath,
  stripBindingPathForInput,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  collectTakenVarNames,
  defaultExtractVarName,
  findExtractVarOwnerStep,
  injectVarDisplayLabel,
  isVarNameTaken,
  suggestAlternateVarNames,
} from "@/lib/extractVarNaming";
import {
  runStepCaseIdLabel,
  type ScenarioRunStep,
} from "@/lib/scenarioRunSequence";
import { FinixLoading } from "../ui/finix-loading";
import { PathPickerChips } from "./PathPickerChips";
import { ScenarioExtractNamePrompt } from "./ScenarioExtractNamePrompt";
import { cn } from "../ui/utils";

type Props = {
  stepIndex: number;
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  variableCatalog: RuntimeVariableEntry[];
  startVarKeys?: string[];
  injectReady: boolean;
  onInjectReuse: (requestPath: string, runtimeVar: string) => void;
  onDisconnectInject: (requestPath: string, runtimeVar?: string) => void;
  onDefineExtract: (
    sourceStepIndex: number,
    responsePath: string,
    varName: string,
  ) => void;
  onRenameExtract: (
    sourceStepIndex: number,
    responsePath: string,
    newVarName: string,
  ) => void;
  onDisconnectExtract: (sourceStepIndex: number, responsePath: string) => void;
  onClose: () => void;
};

function skeletonHasFields(sk: Record<string, unknown> | undefined): boolean {
  return Boolean(sk && Object.keys(sk).length > 0);
}

export function ScenarioStepInlineConnector({
  stepIndex,
  runSteps,
  bindings,
  variableCatalog,
  startVarKeys = [],
  injectReady,
  onInjectReuse,
  onDisconnectInject,
  onDefineExtract,
  onRenameExtract,
  onDisconnectExtract,
  onClose,
}: Props) {
  const step = runSteps[stepIndex];
  const canInject = stepIndex > 0 || startVarKeys.length > 0;
  const [mode, setMode] = useState<"reuse" | "define">(() =>
    canInject && injectReady ? "reuse" : "define",
  );
  const [pickedRequestPath, setPickedRequestPath] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalogDtoSkeletonsDto | null>(null);
  const [sourceCatalog, setSourceCatalog] =
    useState<ServiceCatalogDtoSkeletonsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingExtract, setPendingExtract] = useState<{
    sourceStepIndex: number;
    responsePath: string;
    defaultVar: string;
    draftVar: string;
    suggestions: string[];
    conflictLabel: string;
  } | null>(null);
  const [pendingRename, setPendingRename] = useState<{
    sourceStepIndex: number;
    responsePath: string;
    currentVar: string;
    draftVar: string;
    suggestions: string[];
  } | null>(null);
  const [namePromptError, setNamePromptError] = useState<string | null>(null);

  useEffect(() => {
    if (canInject && injectReady) setMode("reuse");
    else setMode("define");
  }, [canInject, injectReady, stepIndex]);

  const load = useCallback(async () => {
    if (!step) return;
    setLoading(true);
    setError(null);
    try {
      const [cat, src] = await Promise.all([
        getServiceCatalogDtoSkeletons(step.serviceCode).catch(() => null),
        mode === "define"
          ? getServiceCatalogDtoSkeletons(step.serviceCode).catch(() => null)
          : Promise.resolve(null),
      ]);
      setCatalog(cat);
      setSourceCatalog(src);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "DTO 스켈레톤을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [step, mode]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPickedRequestPath(null);
    setError(null);
    setPendingExtract(null);
    setPendingRename(null);
    setNamePromptError(null);
  }, [stepIndex]);

  const curIn = skeletonHasFields(catalog?.input_skeleton)
    ? (catalog!.input_skeleton as Record<string, unknown>)
    : null;
  const sourceOut = skeletonHasFields(sourceCatalog?.output_skeleton)
    ? (sourceCatalog!.output_skeleton as Record<string, unknown>)
    : null;

  const stepBinding = useMemo(
    () => (step ? bindings[step.stepKey] ?? emptyStepBinding() : emptyStepBinding()),
    [bindings, step],
  );

  const connectedRequestPaths = useMemo(() => {
    const set = new Set<string>();
    for (const inj of stepBinding.injects) {
      const p = stripBindingPathForInput(inj.json_path);
      if (p) set.add(p);
    }
    return set;
  }, [stepBinding]);

  const connectedExtractPaths = useMemo(() => {
    const set = new Set<string>();
    if (!step) return set;
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    for (const ex of cfg.extracts) {
      const p = stripBindingPathForInput(ex.json_path);
      if (p) set.add(p);
    }
    return set;
  }, [bindings, step]);

  const connectedVarByPath = useMemo(() => {
    const map: Record<string, string> = {};
    if (!step) return map;
    const cfg = bindings[step.stepKey] ?? emptyStepBinding();
    for (const ex of cfg.extracts) {
      const p = stripBindingPathForInput(ex.json_path);
      const v = ex.var.trim();
      if (p && v) map[p] = v;
    }
    return map;
  }, [bindings, step]);

  const commitExtract = (
    sourceStepIndex: number,
    responsePath: string,
    varName: string,
  ) => {
    const v = varName.trim();
    if (!v) return;
    const step = runSteps[sourceStepIndex];
    if (!step) return;
    const taken = collectTakenVarNames(runSteps, bindings, startVarKeys, {
      exceptStepKey: step.stepKey,
      exceptResponsePath: responsePath,
    });
    if (isVarNameTaken(v, taken)) {
      const owner = findExtractVarOwnerStep(runSteps, bindings, v);
      setNamePromptError(
        owner
          ? `«${v}»는 ${owner.stepLabel}에서 사용 중입니다.`
          : `«${v}»는 이미 사용 중입니다.`,
      );
      return;
    }
    setNamePromptError(null);
    onDefineExtract(sourceStepIndex, responsePath, v);
    setPendingExtract(null);
    setPendingRename(null);
    onClose();
  };

  const handleResponsePathPick = (path: string) => {
    setNamePromptError(null);
    const defaultVar = defaultExtractVarName(path);
    const taken = collectTakenVarNames(runSteps, bindings, startVarKeys, {
      exceptStepKey: step?.stepKey,
      exceptResponsePath: path,
    });
    if (!isVarNameTaken(defaultVar, taken)) {
      commitExtract(stepIndex, path, defaultVar);
      return;
    }
    const owner = findExtractVarOwnerStep(runSteps, bindings, defaultVar);
    const suggestions = suggestAlternateVarNames(
      defaultVar,
      taken,
      stepIndex,
      runSteps,
    );
    setPendingRename(null);
    setPendingExtract({
      sourceStepIndex: stepIndex,
      responsePath: path,
      defaultVar,
      draftVar: suggestions[0] ?? `${defaultVar}Step${stepIndex + 1}`,
      suggestions,
      conflictLabel: owner?.stepLabel ?? "다른 단계",
    });
  };

  const commitRename = (
    sourceStepIndex: number,
    responsePath: string,
    currentVar: string,
    newVarName: string,
  ) => {
    const v = newVarName.trim();
    if (!v || v === currentVar.trim()) {
      setPendingRename(null);
      return;
    }
    const step = runSteps[sourceStepIndex];
    if (!step) return;
    const taken = collectTakenVarNames(runSteps, bindings, startVarKeys, {
      exceptStepKey: step.stepKey,
      exceptResponsePath: responsePath,
    });
    if (isVarNameTaken(v, taken)) {
      const owner = findExtractVarOwnerStep(runSteps, bindings, v);
      setNamePromptError(
        owner
          ? `«${v}»는 ${owner.stepLabel}에서 사용 중입니다.`
          : `«${v}»는 이미 사용 중입니다.`,
      );
      return;
    }
    setNamePromptError(null);
    onRenameExtract(sourceStepIndex, responsePath, v);
    setPendingRename(null);
    onClose();
  };

  const startRename = (path: string, currentVar: string) => {
    setPendingExtract(null);
    setNamePromptError(null);
    const taken = collectTakenVarNames(runSteps, bindings, startVarKeys, {
      exceptStepKey: step?.stepKey,
      exceptResponsePath: path,
    });
    const suggestions = suggestAlternateVarNames(
      currentVar,
      taken,
      stepIndex,
      runSteps,
    );
    setPendingRename({
      sourceStepIndex: stepIndex,
      responsePath: path,
      currentVar,
      draftVar: currentVar,
      suggestions: suggestions.filter((s) => s !== currentVar),
    });
  };

  const startVarsForPick = useMemo(
    () => startInjectVariables(startVarKeys),
    [startVarKeys],
  );

  const priorVarsForPick = useMemo(
    () => priorStepInjectVariables(variableCatalog, stepIndex),
    [variableCatalog, stepIndex],
  );

  const sortedStartVars = useMemo(() => {
    if (!pickedRequestPath) return startVarsForPick;
    return sortConnectedFirst(
      startVarsForPick,
      (v) => isInjectConnectedAtPath(stepBinding, pickedRequestPath, v.var),
      (a, b) => a.var.localeCompare(b.var),
    );
  }, [startVarsForPick, pickedRequestPath, stepBinding]);

  const sortedPriorVars = useMemo(() => {
    if (!pickedRequestPath) return priorVarsForPick;
    return sortConnectedFirst(
      priorVarsForPick,
      (v) => isInjectConnectedAtPath(stepBinding, pickedRequestPath, v.var),
      (a, b) => a.var.localeCompare(b.var),
    );
  }, [priorVarsForPick, pickedRequestPath, stepBinding]);

  const isVarInjectConnected = (runtimeVar: string, requestPath: string | null) => {
    const path =
      requestPath ?? findInjectRequestPath(stepBinding, runtimeVar);
    if (!path) return false;
    return isInjectConnectedAtPath(stepBinding, path, runtimeVar);
  };

  const renderVarButtons = (vars: RuntimeVariableEntry[]) =>
    vars.map((v) => {
      const connected = isVarInjectConnected(v.var, pickedRequestPath);
      const label = injectVarDisplayLabel(
        v.var,
        v.generatedAtStepIndex,
        runSteps,
      );
      return (
        <button
          key={v.var}
          type="button"
          title={label}
          className={cn(
            "text-[10px] font-mono px-2 py-1 rounded-sm border transition-colors max-w-full truncate",
            connected
              ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-500/25"
              : "border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10",
          )}
          onClick={() => toggleInject(pickedRequestPath, v.var)}
        >
          {connected ? "✓ " : ""}
          {label}
        </button>
      );
    });

  const finishInject = (requestPath: string, runtimeVar: string) => {
    setError(null);
    onInjectReuse(requestPath, runtimeVar);
    setPickedRequestPath(null);
    onClose();
  };

  const toggleInject = (
    requestPath: string | null,
    runtimeVar: string,
  ) => {
    const path =
      requestPath ?? findInjectRequestPath(stepBinding, runtimeVar);
    if (!path) return;
    if (isInjectConnectedAtPath(stepBinding, path, runtimeVar)) {
      onDisconnectInject(path, runtimeVar);
      if (pickedRequestPath === path) setPickedRequestPath(null);
      return;
    }
    finishInject(path, runtimeVar);
  };

  const handleRequestPathPick = (path: string) => {
    if (connectedRequestPaths.has(path)) {
      onDisconnectInject(path);
      if (pickedRequestPath === path) setPickedRequestPath(null);
      return;
    }
    setPickedRequestPath(path);
  };

  if (!step) return null;

  const segmentBtn = (target: "reuse" | "define") =>
    cn(
      "flex-1 h-7 rounded-sm text-xs font-medium border inline-flex items-center justify-center gap-0.5",
      mode === target
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground",
      target === "reuse" && !injectReady && "opacity-40 pointer-events-none",
    );

  return (
    <div className="mt-2 rounded-sm border border-primary/30 bg-primary/[0.04] p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {canInject && mode === "reuse" && injectReady
            ? "요청 필드 → 변수 연결"
            : "응답 필드 → 변수 등록"}
        </p>
        <button
          type="button"
          className="h-6 w-6 inline-flex items-center justify-center rounded-sm hover:bg-muted"
          onClick={onClose}
          aria-label="닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {canInject ? (
        <div className="flex gap-1">
          <button
            type="button"
            className={segmentBtn("reuse")}
            onClick={() => injectReady && setMode("reuse")}
            aria-label="요청에 넣기"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            요청
          </button>
          <button
            type="button"
            className={segmentBtn("define")}
            onClick={() => setMode("define")}
            aria-label="응답에서 만들기"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            응답
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">응답 필드 선택</p>
      )}

      {canInject && !injectReady && mode === "reuse" ? (
        <p className="text-[10px] text-muted-foreground">
          컬렉션 변수를 추가하거나 앞 단계 ↑ 응답으로 변수를 만드세요.
        </p>
      ) : null}

      {error ? (
        <p className="text-[11px] text-destructive flex gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {loading ? <FinixLoading size="sm" inline label="불러오는 중…" /> : null}

      {(connectedRequestPaths.size > 0 || connectedExtractPaths.size > 0) ? (
        <p className="text-[10px] text-muted-foreground">연결됨 · 재클릭 시 해제</p>
      ) : null}

      {canInject && mode === "reuse" && injectReady ? (
        <>
          {curIn ? (
            <>
              <p className="text-[10px] text-muted-foreground">요청 필드</p>
              <PathPickerChips
                label=""
                data={curIn}
                connectedPaths={connectedRequestPaths}
                selectedPath={pickedRequestPath}
                onPick={handleRequestPathPick}
                onDisconnect={onDisconnectInject}
              />
            </>
          ) : null}

          {pickedRequestPath && sortedStartVars.length > 0 ? (
            <>
              <p className="text-[10px] text-muted-foreground">컬렉션 변수</p>
              <div className="flex flex-wrap gap-1">
                {renderVarButtons(sortedStartVars)}
              </div>
            </>
          ) : null}

          {pickedRequestPath && sortedPriorVars.length > 0 ? (
            <>
              <p className="text-[10px] text-muted-foreground">앞 단계 변수</p>
              <div className="flex flex-wrap gap-1">
                {renderVarButtons(sortedPriorVars)}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {(!canInject || mode === "define" || !injectReady) ? (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-mono text-primary font-medium">
              [{stepIndex + 1}] {runStepCaseIdLabel(step)}
            </span>
            {" "}응답 · 이 단계에서만 변수 등록
          </p>
          {sourceOut ? (
            <>
              <p className="text-[10px] text-muted-foreground">응답 필드</p>
              {pendingExtract ? (
                <ScenarioExtractNamePrompt
                  defaultVar={pendingExtract.defaultVar}
                  conflictVar={pendingExtract.defaultVar}
                  conflictStepLabel={pendingExtract.conflictLabel}
                  suggestions={pendingExtract.suggestions}
                  draftVar={pendingExtract.draftVar}
                  onDraftVarChange={(value) =>
                    setPendingExtract((prev) =>
                      prev ? { ...prev, draftVar: value } : prev,
                    )
                  }
                  onConfirm={() =>
                    commitExtract(
                      pendingExtract.sourceStepIndex,
                      pendingExtract.responsePath,
                      pendingExtract.draftVar,
                    )
                  }
                  onCancel={() => setPendingExtract(null)}
                  error={namePromptError}
                />
              ) : null}
              {pendingRename ? (
                <ScenarioExtractNamePrompt
                  defaultVar={pendingRename.currentVar}
                  conflictVar={pendingRename.currentVar}
                  conflictStepLabel="현재 이름"
                  suggestions={pendingRename.suggestions}
                  draftVar={pendingRename.draftVar}
                  onDraftVarChange={(value) =>
                    setPendingRename((prev) =>
                      prev ? { ...prev, draftVar: value } : prev,
                    )
                  }
                  onConfirm={() =>
                    commitRename(
                      pendingRename.sourceStepIndex,
                      pendingRename.responsePath,
                      pendingRename.currentVar,
                      pendingRename.draftVar,
                    )
                  }
                  confirmLabel="변경"
                  onCancel={() => setPendingRename(null)}
                  error={namePromptError}
                  headline="변수 이름 변경"
                  hint="연결된 ↓ 요청 inject 이름도 함께 바뀝니다."
                />
              ) : null}
              <PathPickerChips
              label=""
              data={sourceOut}
              connectedPaths={connectedExtractPaths}
              connectedVarByPath={connectedVarByPath}
              onPick={handleResponsePathPick}
              onRenameVar={startRename}
              onDisconnect={(path) => onDisconnectExtract(stepIndex, path)}
            />
            </>
          ) : !loading ? null : null}
        </div>
      ) : null}
    </div>
  );
}
