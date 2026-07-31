import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getServiceCatalogDtoSkeletons } from "@/api/serviceCatalogApi";
import type { ServiceCatalogDtoSkeletonsDto } from "@/api/types";
import { ApiError } from "@/api/client";
import {
  START_VAR_STEP_INDEX,
  fieldVarNameFromPath,
} from "@/lib/scenarioConnectionUx";
import type { ScenarioRunStep } from "@/lib/scenarioRunSequence";
import { runStepCaseIdLabel } from "@/lib/scenarioRunSequence";
import type { BindingCanvasEdge } from "@/lib/scenarioBindingCanvas";
import { FinixLoading } from "../../ui/finix-loading";
import { FinixPrimaryButton } from "../../ui/finix-button";
import {
  FinixField,
  FinixUnderlineSelect,
} from "../../ui/finix-form";
import { PathPickerChips } from "../PathPickerChips";

export type LinkDraft = {
  fromStepIndex: number;
  toStepIndex: number;
  varName: string;
  responsePath: string;
  requestPath: string;
};

type Props = {
  open: boolean;
  runSteps: ScenarioRunStep[];
  startVarKeys: readonly string[];
  initial?: Partial<LinkDraft> | null;
  editingEdge?: BindingCanvasEdge | null;
  onClose: () => void;
  onApply: (draft: LinkDraft) => void;
  onDelete?: () => void;
};

function skeletonRecord(
  sk: ServiceCatalogDtoSkeletonsDto | null,
  kind: "input" | "output",
): Record<string, unknown> | null {
  const raw = kind === "input" ? sk?.input_skeleton : sk?.output_skeleton;
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

export function ScenarioBindingLinkDrawer({
  open,
  runSteps,
  startVarKeys,
  initial,
  editingEdge,
  onClose,
  onApply,
  onDelete,
}: Props) {
  const [fromStepIndex, setFromStepIndex] = useState(START_VAR_STEP_INDEX);
  const [toStepIndex, setToStepIndex] = useState(1);
  const [responsePath, setResponsePath] = useState("");
  const [requestPath, setRequestPath] = useState("");
  const [varName, setVarName] = useState("");
  const [fromCatalog, setFromCatalog] =
    useState<ServiceCatalogDtoSkeletonsDto | null>(null);
  const [toCatalog, setToCatalog] =
    useState<ServiceCatalogDtoSkeletonsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const from =
      editingEdge?.fromStepIndex ??
      initial?.fromStepIndex ??
      (startVarKeys.length > 0 ? START_VAR_STEP_INDEX : 0);
    const to =
      editingEdge?.toStepIndex ??
      initial?.toStepIndex ??
      Math.min(1, Math.max(0, runSteps.length - 1));
    setFromStepIndex(from);
    setToStepIndex(to);
    setResponsePath(editingEdge?.responsePath ?? initial?.responsePath ?? "");
    setRequestPath(editingEdge?.requestPath ?? initial?.requestPath ?? "");
    setVarName(editingEdge?.varName ?? initial?.varName ?? "");
    setError(null);
  }, [open, editingEdge, initial, runSteps.length, startVarKeys.length]);

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromStep =
        fromStepIndex >= 0 ? runSteps[fromStepIndex] : null;
      const toStep = runSteps[toStepIndex];
      const [fromCat, toCat] = await Promise.all([
        fromStep
          ? getServiceCatalogDtoSkeletons(fromStep.serviceCode)
          : Promise.resolve(null),
        toStep
          ? getServiceCatalogDtoSkeletons(toStep.serviceCode)
          : Promise.resolve(null),
      ]);
      setFromCatalog(fromCat);
      setToCatalog(toCat);
    } catch (e) {
      setFromCatalog(null);
      setToCatalog(null);
      setError(
        e instanceof ApiError ? e.message : "필드 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [fromStepIndex, toStepIndex, runSteps]);

  useEffect(() => {
    if (!open) return;
    void loadCatalogs();
  }, [open, loadCatalogs]);

  const fromOutput = useMemo(
    () => skeletonRecord(fromCatalog, "output"),
    [fromCatalog],
  );
  const toInput = useMemo(
    () => skeletonRecord(toCatalog, "input"),
    [toCatalog],
  );

  const canApply =
    toStepIndex >= 0 &&
    requestPath.trim().length > 0 &&
    (fromStepIndex === START_VAR_STEP_INDEX
      ? varName.trim().length > 0 || startVarKeys.length > 0
      : responsePath.trim().length > 0 && fromStepIndex < toStepIndex);

  if (!open) return null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-border bg-card lg:w-[min(22rem,100%)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">
          {editingEdge ? "연결 편집" : "연결 추가"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <FinixField label="출처">
          <FinixUnderlineSelect
            value={String(fromStepIndex)}
            onChange={(e) => {
              setFromStepIndex(Number(e.target.value));
              setResponsePath("");
              setVarName("");
            }}
          >
            {startVarKeys.length > 0 ? (
              <option value={START_VAR_STEP_INDEX}>Start (컬렉션 변수)</option>
            ) : null}
            {runSteps.map((s, i) => (
              <option key={s.stepKey} value={i} disabled={i >= toStepIndex}>
                {i + 1}. {runStepCaseIdLabel(s)}
              </option>
            ))}
          </FinixUnderlineSelect>
        </FinixField>

        <FinixField label="대상">
          <FinixUnderlineSelect
            value={String(toStepIndex)}
            onChange={(e) => {
              setToStepIndex(Number(e.target.value));
              setRequestPath("");
            }}
          >
            {runSteps.map((s, i) => (
              <option
                key={s.stepKey}
                value={i}
                disabled={
                  fromStepIndex !== START_VAR_STEP_INDEX && i <= fromStepIndex
                }
              >
                {i + 1}. {runStepCaseIdLabel(s)}
              </option>
            ))}
          </FinixUnderlineSelect>
        </FinixField>

        {loading ? (
          <FinixLoading inline label="필드 불러오는 중…" />
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}

        {fromStepIndex === START_VAR_STEP_INDEX ? (
          <FinixField label="컬렉션 변수">
            <FinixUnderlineSelect
              value={varName}
              onChange={(e) => setVarName(e.target.value)}
            >
              <option value="">선택</option>
              {startVarKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </FinixUnderlineSelect>
          </FinixField>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              응답 필드 (extract)
            </p>
            <PathPickerChips
              label="response"
              data={fromOutput}
              selectedPath={responsePath || null}
              onPick={(p) => {
                setResponsePath(p);
                if (!varName.trim()) setVarName(fieldVarNameFromPath(p));
              }}
              emptyHint="응답 스키마가 없습니다."
            />
            {responsePath ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                var: {varName || fieldVarNameFromPath(responsePath)}
              </p>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            요청 필드 (inject)
          </p>
          <PathPickerChips
            label="request"
            data={toInput}
            selectedPath={requestPath || null}
            onPick={setRequestPath}
            emptyHint="요청 스키마가 없습니다."
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border p-3">
        {editingEdge && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-destructive hover:underline"
          >
            연결 삭제
          </button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            취소
          </button>
          <FinixPrimaryButton
            type="button"
            className="h-8 px-3 text-xs"
            disabled={!canApply}
            onClick={() => {
              const name =
                varName.trim() ||
                (fromStepIndex === START_VAR_STEP_INDEX
                  ? ""
                  : fieldVarNameFromPath(responsePath));
              if (!name || !requestPath.trim()) return;
              onApply({
                fromStepIndex,
                toStepIndex,
                varName: name,
                responsePath,
                requestPath,
              });
            }}
          >
            적용
          </FinixPrimaryButton>
        </div>
      </div>
    </div>
  );
}
