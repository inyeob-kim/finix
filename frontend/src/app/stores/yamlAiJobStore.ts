import { create } from "zustand";
import { ApiError } from "@/api/client";
import { generateServiceRulesDraftFromSource } from "@/api/serviceRulesApi";
import type { ServiceRuleBundleReadDto } from "@/api/types";

export type YamlAiJobStatus = "running" | "success" | "error";

export type YamlAiJobStageId =
  | "catalog"
  | "data_pool"
  | "swagger"
  | "llm"
  | "validate"
  | "save";

export type YamlAiJobStage = {
  id: YamlAiJobStageId;
  label: string;
};

export type YamlAiJob = {
  id: string;
  serviceCode: string;
  status: YamlAiJobStatus;
  error?: string;
  bundle?: ServiceRuleBundleReadDto;
  startedAt: number;
  stages: YamlAiJobStage[];
  stageIndex: number;
  /** 0–100 visual progress while running / finished */
  progress: number;
  useDataPool: boolean;
  useSwagger: boolean;
};

export type YamlAiJobStartPayload = {
  serviceCode: string;
  source_code: string;
  source_version?: string | null;
  hints?: string | null;
  created_by?: string | null;
  use_data_pool?: boolean;
  use_swagger?: boolean;
};

type YamlAiJobState = {
  jobs: YamlAiJob[];
  startJob: (payload: YamlAiJobStartPayload) => string;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
};

const stageTimers = new Map<string, number>();

function newJobId(): string {
  return `yaml-ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildYamlAiJobStages(payload: {
  use_data_pool?: boolean;
  use_swagger?: boolean;
}): YamlAiJobStage[] {
  const stages: YamlAiJobStage[] = [
    { id: "catalog", label: "카탈로그 확인 중" },
  ];
  if (payload.use_data_pool) {
    stages.push({ id: "data_pool", label: "Data Pool 참조 중" });
  }
  if (payload.use_swagger) {
    stages.push({ id: "swagger", label: "Swagger 참조 중" });
  }
  stages.push(
    { id: "llm", label: "YAML 생성 중" },
    { id: "validate", label: "서버 검증 중" },
    { id: "save", label: "초안 저장 중" },
  );
  return stages;
}

function clearStageTimer(id: string) {
  const t = stageTimers.get(id);
  if (t != null) {
    window.clearTimeout(t);
    stageTimers.delete(id);
  }
}

function scheduleStageTick(id: string, delayMs: number) {
  clearStageTimer(id);
  stageTimers.set(
    id,
    window.setTimeout(() => {
      stageTimers.delete(id);
      useYamlAiJobStore.getState().advanceRunningStage(id);
    }, delayMs),
  );
}

type YamlAiJobStoreInternal = YamlAiJobState & {
  advanceRunningStage: (id: string) => void;
  patchJob: (id: string, patch: Partial<YamlAiJob>) => void;
};

export const useYamlAiJobStore = create<YamlAiJobStoreInternal>((set, get) => ({
  jobs: [],

  patchJob: (id, patch) => {
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    }));
  },

  advanceRunningStage: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || job.status !== "running") return;

    const llmIndex = job.stages.findIndex((s) => s.id === "llm");
    const holdAt = llmIndex >= 0 ? llmIndex : Math.max(0, job.stages.length - 3);

    if (job.stageIndex < holdAt) {
      const next = job.stageIndex + 1;
      const progress = Math.round(((next + 0.35) / job.stages.length) * 72);
      get().patchJob(id, { stageIndex: next, progress });
      scheduleStageTick(id, next === holdAt ? 1600 : 1100);
      return;
    }

    if (job.stageIndex === holdAt && job.progress < 88) {
      get().patchJob(id, {
        progress: Math.min(88, job.progress + 3),
      });
      scheduleStageTick(id, 2200);
    }
  },

  startJob: (payload) => {
    const id = newJobId();
    const serviceCode = payload.serviceCode.trim();
    const stages = buildYamlAiJobStages(payload);
    const job: YamlAiJob = {
      id,
      serviceCode,
      status: "running",
      startedAt: Date.now(),
      stages,
      stageIndex: 0,
      progress: 8,
      useDataPool: Boolean(payload.use_data_pool),
      useSwagger: Boolean(payload.use_swagger),
    };
    set((s) => ({ jobs: [job, ...s.jobs] }));
    scheduleStageTick(id, 900);

    void (async () => {
      try {
        const bundle = await generateServiceRulesDraftFromSource(serviceCode, {
          source_code: payload.source_code,
          source_version: payload.source_version ?? null,
          hints: payload.hints ?? null,
          created_by: payload.created_by ?? null,
          use_data_pool: payload.use_data_pool ?? false,
          use_swagger: payload.use_swagger ?? false,
        });
        if (!get().jobs.some((j) => j.id === id)) return;
        clearStageTimer(id);
        const stagesNow = get().jobs.find((j) => j.id === id)?.stages ?? stages;
        const validateIdx = stagesNow.findIndex((s) => s.id === "validate");
        const saveIdx = stagesNow.findIndex((s) => s.id === "save");
        get().patchJob(id, {
          stageIndex: validateIdx >= 0 ? validateIdx : stagesNow.length - 2,
          progress: 94,
        });
        await new Promise((r) => window.setTimeout(r, 280));
        if (!get().jobs.some((j) => j.id === id)) return;
        get().patchJob(id, {
          stageIndex: saveIdx >= 0 ? saveIdx : stagesNow.length - 1,
          progress: 98,
        });
        await new Promise((r) => window.setTimeout(r, 220));
        if (!get().jobs.some((j) => j.id === id)) return;
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "success" as const,
                  bundle,
                  error: undefined,
                  stageIndex: j.stages.length - 1,
                  progress: 100,
                }
              : j,
          ),
        }));
      } catch (e) {
        if (!get().jobs.some((j) => j.id === id)) return;
        clearStageTimer(id);
        const message =
          e instanceof ApiError ? e.message : "YAML 등록에 실패했습니다.";
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? { ...j, status: "error" as const, error: message }
              : j,
          ),
        }));
      }
    })();

    return id;
  },

  dismissJob: (id) => {
    clearStageTimer(id);
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
  },

  clearFinished: () => {
    set((s) => {
      for (const j of s.jobs) {
        if (j.status !== "running") clearStageTimer(j.id);
      }
      return { jobs: s.jobs.filter((j) => j.status === "running") };
    });
  },
}));
