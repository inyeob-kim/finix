import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { getServiceCatalogDtoSkeletons } from "@/api/serviceCatalogApi";
import type { ServiceCatalogDtoSkeletonsDto } from "@/api/types";
import { ApiError } from "@/api/client";
import {
  setExtractVarAtPath,
  removeExtractByPath,
  emptyStepBinding,
  type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
  allocateUniqueExtractVarName,
  renameExtractVarInScenario,
} from "@/lib/extractVarNaming";
import { formatPostmanVar } from "@/lib/postmanBodyBindings";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import { PathPickerChips } from "./PathPickerChips";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  step: ScenarioRunStep;
  stepIndex: number;
  runSteps: ScenarioRunStep[];
  bindings: StepBindingsByStepKey;
  onBindingsChange: (next: StepBindingsByStepKey) => void;
};

export function ScenarioStepPostmanTests({
  step,
  stepIndex,
  runSteps,
  bindings,
  onBindingsChange,
}: Props) {
  const [catalog, setCatalog] = useState<ServiceCatalogDtoSkeletonsDto | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = bindings[step.stepKey] ?? emptyStepBinding();
  const extracts = cfg.extracts;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await getServiceCatalogDtoSkeletons(step.serviceCode));
    } catch (e) {
      setCatalog(null);
      setError(
        e instanceof ApiError ? e.message : "응답 스키마를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [step.serviceCode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Migrate plain ``acctNbr`` (or wrong suffix) → ``acctNbr_TC{n}``; update injects too.
  useEffect(() => {
    let next = bindings;
    let changed = false;
    for (const row of extracts) {
      const expected = allocateUniqueExtractVarName({
        responsePath: row.json_path,
        runSteps,
        bindings: next,
        sourceStepIndex: stepIndex,
        exceptResponsePath: row.json_path,
      });
      if (expected === row.var.trim()) continue;
      next = renameExtractVarInScenario(
        runSteps,
        next,
        stepIndex,
        row.json_path,
        expected,
      );
      changed = true;
    }
    if (changed) onBindingsChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migrate once per extract snapshot
  }, [step.stepKey, stepIndex, extracts, runSteps, onBindingsChange]);

  const output =
    catalog?.output_skeleton && typeof catalog.output_skeleton === "object"
      ? (catalog.output_skeleton as Record<string, unknown>)
      : null;

  const connectedPaths = useMemo(() => {
    return new Set(
      extracts.map((r) => r.json_path.replace(/^\$\.?/, "")).filter(Boolean),
    );
  }, [extracts]);

  const connectedVarByPath = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of extracts) {
      const p = row.json_path.replace(/^\$\.?/, "");
      if (p) map[p] = row.var;
    }
    return map;
  }, [extracts]);

  const addExtract = (dotPath: string) => {
    const varName = allocateUniqueExtractVarName({
      responsePath: dotPath,
      runSteps,
      bindings,
      sourceStepIndex: stepIndex,
      exceptResponsePath: dotPath,
    });
    onBindingsChange(
      setExtractVarAtPath(bindings, step.stepKey, dotPath, varName),
    );
  };

  const removeExtract = (dotPath: string) => {
    onBindingsChange(removeExtractByPath(bindings, step.stepKey, dotPath));
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <FinixLoading inline label="응답 필드 불러오는 중…" />
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <PathPickerChips
          label="response"
          data={output}
          onPick={addExtract}
          onDisconnect={removeExtract}
          connectedPaths={connectedPaths}
          connectedVarByPath={connectedVarByPath}
          activeBadge="저장됨"
          activeTitle="다시 클릭하면 변수 해제"
          emptyHint="응답 스키마가 없습니다."
        />
      )}

      {extracts.length > 0 ? (
        <ul className="space-y-1">
          {extracts.map((row) => (
            <li
              key={`${row.var}:${row.json_path}`}
              className="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5"
            >
              <span className="font-mono text-[11px] text-primary shrink-0">
                {formatPostmanVar(row.var)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground truncate min-w-0">
                ← {row.json_path}
              </span>
              <button
                type="button"
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="삭제"
                onClick={() => removeExtract(row.json_path)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
