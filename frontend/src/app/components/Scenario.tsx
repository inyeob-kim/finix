import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  Plus,
  CircleCheck,
  CircleX,
  GripVertical,
  Trash2,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { ScenarioStepDto } from "@/api/types";
import { getScenario, patchScenario } from "@/api/scenarioApi";
import { generateTestCases } from "@/api/testcaseApi";
import { ApiError } from "@/api/client";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixLoading, FinixLoadingPage } from "./ui/finix-loading";
import { PageShell } from "./PageShell";

interface Step {
  id: string;
  number: number;
  action: string;
  result: "success" | "error";
  reason?: string;
}

function dtoToStep(s: ScenarioStepDto): Step {
  return {
    id: s.id,
    number: s.number,
    action: s.action,
    result: s.result,
    reason: s.reason ?? undefined,
  };
}

function stepsToDto(steps: Step[]): ScenarioStepDto[] {
  return steps.map((s) => ({
    id: s.id,
    number: s.number,
    action: s.action,
    result: s.result,
    reason: s.reason,
  }));
}

function newStepLabel(n: number): Step {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `step-${Date.now()}`;
  return {
    id,
    number: n,
    action: "새 단계",
    result: "success",
    reason: undefined,
  };
}

const ITEM_TYPE = "STEP";

function StepCard({
  step,
  index,
  moveStep,
  deleteStep,
}: {
  step: Step;
  index: number;
  moveStep: (dragIndex: number, hoverIndex: number) => void;
  deleteStep: (id: string) => void;
}) {
  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        moveStep(item.index, index);
        item.index = index;
      }
    },
  });

  const StatusBadge = ({ status }: { status: Step["result"] }) => {
    const label = status === "success" ? "성공" : "실패";
    return (
      <span
        className={[
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
          "text-[12px] sm:text-xs whitespace-nowrap",
          "shrink-0 flex-none",
          status === "success"
            ? "bg-success/10 text-success"
            : "bg-destructive/10 text-destructive",
        ].join(" ")}
      >
        {status === "success" ? (
          <CircleCheck className="w-3 h-3" />
        ) : (
          <CircleX className="w-3 h-3" />
        )}
        {label}
      </span>
    );
  };

  return (
    <div
      ref={(node) => preview(drop(node))}
      className={`bg-card border border-border rounded-sm p-5 transition-opacity shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          ref={drag}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1 space-y-3">
          {/* Row 1: number + title (left) / status badge + delete (right) */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm text-primary">{step.number}</span>
              </div>
              <div className="min-w-0">
                <h4 className="mb-0.5">{step.action}</h4>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-none">
              <StatusBadge status={step.result} />
              <button
                type="button"
                onClick={() => deleteStep(step.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: service details */}
          <div className="text-sm text-muted-foreground">
            {step.reason ? (
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {step.reason.split(" | ").map((part, i) => (
                  <span key={`${part}-${i}`}>{part}</span>
                ))}
              </div>
            ) : (
              <span className="italic text-muted-foreground/70">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Scenario() {
  const { scenarioId: scenarioIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scenarioId = Number(scenarioIdParam);

  const [promptLabel, setPromptLabel] = useState(
    () => (location.state as { prompt?: string } | null)?.prompt ?? "",
  );
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(scenarioId)) {
      setError("잘못된 시나리오 주소입니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getScenario(scenarioId);
      setPromptLabel((prev) => data.prompt ?? prev);
      setSteps(data.steps?.length ? data.steps.map(dtoToStep) : []);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "시나리오를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveStep = (dragIndex: number, hoverIndex: number) => {
    const newSteps = [...steps];
    const [removed] = newSteps.splice(dragIndex, 1);
    newSteps.splice(hoverIndex, 0, removed);
    setSteps(newSteps.map((step, idx) => ({ ...step, number: idx + 1 })));
  };

  const deleteStep = (id: string) => {
    setSteps(
      steps
        .filter((step) => step.id !== id)
        .map((step, idx) => ({ ...step, number: idx + 1 })),
    );
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, newStepLabel(prev.length + 1)]);
  };

  const handleGenerateTests = async () => {
    if (!Number.isFinite(scenarioId) || !steps.length) {
      setError("저장할 단계가 없습니다.");
      return;
    }
    setBusy(true);
    setIsGeneratingTests(true);
    setError(null);
    try {
      await patchScenario(scenarioId, { steps: stepsToDto(steps) });
      await generateTestCases(scenarioId, null);
      navigate(`/test-case/${scenarioId}`);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "테스트 케이스 생성에 실패했습니다.",
      );
    } finally {
      setIsGeneratingTests(false);
      setBusy(false);
    }
  };

  if (loading) {
    return <FinixLoadingPage label="시나리오를 불러오는 중…" />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <PageShell
        icon={<FlaskConical className="w-5 h-5" strokeWidth={2} />}
        title="시나리오 편집"
        description="단계를 검토·수정하고 서비스 시퀀스를 확정한 뒤 테스트케이스를 생성합니다."
      >
        <div className="w-full max-w-4xl mx-auto space-y-6">
          <div className="rounded-sm border border-border bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
              <Sparkles className="w-3.5 h-3.5" />
              생성 기준: {promptLabel || "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              드래그로 순서 변경 · 삭제/추가
            </div>
          </div>

          {error && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                moveStep={moveStep}
                deleteStep={deleteStep}
              />
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleAddStep}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-sm hover:border-primary/50 transition-colors shadow-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              단계 추가
            </button>
          </div>

          <FinixPrimaryButton
            onClick={() => void handleGenerateTests()}
            disabled={busy || !steps.length}
            className="w-full h-12"
          >
            {isGeneratingTests ? (
              <>
                <FinixLoading size="sm" inline />
                <span>생성 중…</span>
              </>
            ) : (
              <>
                <FlaskConical className="w-5 h-5" />
                <span>테스트 케이스 생성</span>
              </>
            )}
          </FinixPrimaryButton>
        </div>
      </PageShell>
    </DndProvider>
  );
}
