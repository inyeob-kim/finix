import { create } from "zustand";
import { ApiError } from "@/api/client";
import {
  generateServiceRulesDraftFromSource,
  getActiveServiceRules,
  importServiceRulesFromPostman,
  type PostmanRulesImportResultDto,
} from "@/api/serviceRulesApi";
import type { ServiceRuleBundleReadDto } from "@/api/types";

export type YamlAiJobStatus = "running" | "success" | "error";

export type YamlAiJobKind = "source" | "postman";

export type YamlAiJobStageId =
  | "catalog"
  | "data_pool"
  | "swagger"
  | "parse"
  | "match"
  | "llm"
  | "validate"
  | "save";

export type YamlAiJobStage = {
  id: YamlAiJobStageId;
  /** Short step title (shown in the agent-style list). */
  label: string;
  /** One-line narration under the title while this step is current. */
  detail?: string;
};

export type YamlAiJobLogLine = {
  id: string;
  text: string;
};

export type YamlAiJobStartPayload = {
  serviceCode: string;
  source_code: string;
  source_version?: string | null;
  hints?: string | null;
  created_by?: string | null;
  use_data_pool?: boolean;
  use_swagger?: boolean;
  overwrite_draft?: boolean;
};

export type YamlAiJob = {
  id: string;
  kind: YamlAiJobKind;
  serviceCode: string;
  status: YamlAiJobStatus;
  error?: string;
  bundle?: ServiceRuleBundleReadDto;
  postmanResult?: PostmanRulesImportResultDto;
  /** Set when import/generate failed because drafts exist; allows banner retry. */
  needsOverwrite?: boolean;
  /** Source→YAML payload kept for overwrite/merge retry. */
  sourcePayload?: YamlAiJobStartPayload;
  postmanCollection?: unknown;
  postmanEnvironment?: unknown | null;
  postmanFileName?: string | null;
  postmanEnvironmentFileName?: string | null;
  startedAt: number;
  stages: YamlAiJobStage[];
  stageIndex: number;
  /** Activity lines shown after finish via "로그 보기". */
  log: YamlAiJobLogLine[];
  /** 0–100 visual progress while running / finished */
  progress: number;
  useDataPool: boolean;
  useSwagger: boolean;
};

export type PostmanImportJobStartPayload = {
  collection: unknown;
  environment?: unknown | null;
  fileName?: string | null;
  environmentFileName?: string | null;
  overwrite_draft?: boolean;
  created_by?: string | null;
};

type YamlAiJobState = {
  jobs: YamlAiJob[];
  startJob: (payload: YamlAiJobStartPayload) => string;
  startPostmanJob: (payload: PostmanImportJobStartPayload) => string;
  /** Retry Postman import or source→YAML after draft-overwrite confirmation. */
  retryOverwrite: (id: string) => void;
  dismissJob: (id: string) => void;
  clearFinished: () => void;
};

const stageTimers = new Map<string, number>();

function newJobId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildYamlAiJobStages(payload: {
  use_data_pool?: boolean;
  use_swagger?: boolean;
}): YamlAiJobStage[] {
  const stages: YamlAiJobStage[] = [
    {
      id: "catalog",
      label: "카탈로그 확인",
      detail: "서비스 메타와 DTO 뼈대를 확인합니다.",
    },
  ];
  if (payload.use_data_pool) {
    stages.push({
      id: "data_pool",
      label: "Data Pool 참조",
      detail: "샘플 필드 힌트를 가져옵니다.",
    });
  }
  if (payload.use_swagger) {
    stages.push({
      id: "swagger",
      label: "Swagger 참조",
      detail: "OpenAPI 연산 힌트를 가져옵니다.",
    });
  }
  stages.push(
    {
      id: "llm",
      label: "소스 분석",
      detail: "소스를 읽고 YAML 초안을 구성합니다.",
    },
    {
      id: "validate",
      label: "규칙 merge",
      detail: "기존 규칙과 맞춰 검증합니다.",
    },
    {
      id: "save",
      label: "작업본 저장",
      detail: "드래프트를 저장합니다.",
    },
  );
  return stages;
}

export function buildPostmanImportJobStages(): YamlAiJobStage[] {
  return [
    {
      id: "parse",
      label: "Collection 파싱",
      detail: "요청·폴더·변수를 읽고 정리합니다.",
    },
    {
      id: "match",
      label: "서비스 매칭",
      detail: "요청 path를 CBS 카탈로그와 맞춥니다.",
    },
    {
      id: "llm",
      label: "케이스 계획",
      detail: "N/E 케이스와 merge/create 플랜을 잡습니다.",
    },
    {
      id: "save",
      label: "작업본 반영",
      detail: "서비스별 YAML 작업본을 저장합니다.",
    },
  ];
}

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function logLine(text: string): YamlAiJobLogLine {
  return { id: newLogId(), text };
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

function needsOverwriteConfirm(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    typeof err.message === "string" &&
    err.message.includes("overwrite_draft")
  );
}

type YamlAiJobStoreInternal = YamlAiJobState & {
  advanceRunningStage: (id: string) => void;
  patchJob: (id: string, patch: Partial<YamlAiJob>) => void;
  appendLog: (id: string, text: string) => void;
  runPostmanImport: (
    id: string,
    payload: PostmanImportJobStartPayload,
  ) => Promise<void>;
};

export const useYamlAiJobStore = create<YamlAiJobStoreInternal>((set, get) => ({
  jobs: [],

  patchJob: (id, patch) => {
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    }));
  },

  appendLog: (id, text) => {
    const line = logLine(text);
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id ? { ...j, log: [...j.log, line] } : j,
      ),
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
      const prevStage = job.stages[job.stageIndex];
      const nextStage = job.stages[next];
      const extra: YamlAiJobLogLine[] = [];
      if (prevStage) extra.push(logLine(`${prevStage.label} 완료.`));
      if (nextStage) {
        extra.push(
          logLine(nextStage.detail?.trim() || `${nextStage.label} 진행 중…`),
        );
      }
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                stageIndex: next,
                progress,
                log: [...j.log, ...extra],
              }
            : j,
        ),
      }));
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
    const id = newJobId("yaml-ai");
    const serviceCode = payload.serviceCode.trim();
    const stages = buildYamlAiJobStages(payload);
    const first = stages[0];
    const storedPayload: YamlAiJobStartPayload = {
      ...payload,
      serviceCode,
    };
    const job: YamlAiJob = {
      id,
      kind: "source",
      serviceCode,
      status: "running",
      startedAt: Date.now(),
      stages,
      stageIndex: 0,
      progress: 8,
      useDataPool: Boolean(payload.use_data_pool),
      useSwagger: Boolean(payload.use_swagger),
      sourcePayload: storedPayload,
      needsOverwrite: false,
      log: [
        logLine(
          payload.overwrite_draft
            ? `${serviceCode} 소스→YAML을 다시 시작합니다 (기존 작업본에 병합).`
            : `${serviceCode} 소스에서 YAML 초안을 만들기 시작합니다.`,
        ),
        logLine(first?.detail?.trim() || `${first?.label ?? "작업"} 진행 중…`),
      ],
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
          overwrite_draft: payload.overwrite_draft ?? false,
        });
        if (!get().jobs.some((j) => j.id === id)) return;
        clearStageTimer(id);
        const stagesNow = get().jobs.find((j) => j.id === id)?.stages ?? stages;
        const validateIdx = stagesNow.findIndex((s) => s.id === "validate");
        const saveIdx = stagesNow.findIndex((s) => s.id === "save");
        const llmIdx = stagesNow.findIndex((s) => s.id === "llm");
        const llmStage = llmIdx >= 0 ? stagesNow[llmIdx] : null;
        if (llmStage) get().appendLog(id, `${llmStage.label} 완료.`);
        const validateStage =
          validateIdx >= 0 ? stagesNow[validateIdx] : null;
        get().patchJob(id, {
          stageIndex: validateIdx >= 0 ? validateIdx : stagesNow.length - 2,
          progress: 94,
        });
        get().appendLog(
          id,
          validateStage?.detail?.trim() || "기존 규칙과 맞춰 병합·검증합니다.",
        );
        await new Promise((r) => window.setTimeout(r, 280));
        if (!get().jobs.some((j) => j.id === id)) return;
        if (validateStage) get().appendLog(id, `${validateStage.label} 완료.`);
        const saveStage = saveIdx >= 0 ? stagesNow[saveIdx] : null;
        get().patchJob(id, {
          stageIndex: saveIdx >= 0 ? saveIdx : stagesNow.length - 1,
          progress: 98,
        });
        get().appendLog(
          id,
          saveStage?.detail?.trim() || "드래프트를 저장합니다.",
        );
        await new Promise((r) => window.setTimeout(r, 220));
        if (!get().jobs.some((j) => j.id === id)) return;
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "success" as const,
                  bundle,
                  needsOverwrite: false,
                  error: undefined,
                  stageIndex: j.stages.length - 1,
                  progress: 100,
                  log: [
                    ...j.log,
                    logLine(
                      `작업본 저장 완료 · v${bundle.version ?? "—"}` +
                        (payload.overwrite_draft
                          ? " (기존 케이스와 병합)."
                          : "."),
                    ),
                  ],
                }
              : j,
          ),
        }));
      } catch (e) {
        if (!get().jobs.some((j) => j.id === id)) return;
        clearStageTimer(id);
        if (!payload.overwrite_draft && needsOverwriteConfirm(e)) {
          const msg =
            "이미 작업본이 있습니다. 확인 후 기존 작업본에 병합하세요.";
          set((s) => ({
            jobs: s.jobs.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status: "error" as const,
                    needsOverwrite: true,
                    error: msg,
                    log: [...j.log, logLine(msg)],
                  }
                : j,
            ),
          }));
          return;
        }
        const message =
          e instanceof ApiError ? e.message : "YAML 등록에 실패했습니다.";
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "error" as const,
                  needsOverwrite: false,
                  error: message,
                  log: [...j.log, logLine(message)],
                }
              : j,
          ),
        }));
      }
    })();

    return id;
  },

  runPostmanImport: async (id, payload) => {
    const stages = buildPostmanImportJobStages();
    try {
      const result = await importServiceRulesFromPostman({
        collection: payload.collection,
        environment: payload.environment ?? null,
        overwrite_draft: payload.overwrite_draft ?? false,
        created_by: payload.created_by ?? null,
      });
      if (!get().jobs.some((j) => j.id === id)) return;
      clearStageTimer(id);
      const prev = get().jobs.find((j) => j.id === id);
      if (prev && prev.stageIndex < stages.length - 1) {
        const cur = prev.stages[prev.stageIndex];
        if (cur) get().appendLog(id, `${cur.label} 완료.`);
      }
      const saveStage = stages[stages.length - 1];
      get().patchJob(id, {
        stageIndex: stages.length - 1,
        progress: 96,
      });
      get().appendLog(
        id,
        saveStage?.detail?.trim() || "서비스별 YAML 작업본을 저장합니다.",
      );
      await new Promise((r) => window.setTimeout(r, 220));
      if (!get().jobs.some((j) => j.id === id)) return;

      let bundle: ServiceRuleBundleReadDto | undefined;
      const first = result.services[0];
      if (first) {
        try {
          bundle =
            (await getActiveServiceRules(first.service_code)) ?? undefined;
        } catch {
          bundle = undefined;
        }
      }

      const label =
        result.services.length === 0
          ? "Postman"
          : result.services.length === 1
            ? result.services[0].service_code
            : `Postman (${result.services.length})`;

      const summary: YamlAiJobLogLine[] = [];
      if (result.services.length === 0) {
        summary.push(
          logLine("매칭된 서비스가 없어 작업본을 만들지 않았습니다."),
        );
      } else {
        summary.push(
          logLine(
            `작업본 ${result.services.length}개 갱신` +
              (result.unmatched.length > 0
                ? ` · 미매칭 ${result.unmatched.length}건`
                : "") +
              ".",
          ),
        );
        const codes = result.services.map((s) => s.service_code).slice(0, 8);
        summary.push(
          logLine(
            codes.join(", ") +
              (result.services.length > 8
                ? ` 외 ${result.services.length - 8}개`
                : ""),
          ),
        );
      }
      for (const note of result.notes ?? []) {
        if (note.trim()) summary.push(logLine(note.trim()));
      }

      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: "success" as const,
                serviceCode: label,
                bundle,
                postmanResult: result,
                needsOverwrite: false,
                error: undefined,
                stageIndex: j.stages.length - 1,
                progress: 100,
                log: [...j.log, ...summary],
              }
            : j,
        ),
      }));
    } catch (e) {
      if (!get().jobs.some((j) => j.id === id)) return;
      clearStageTimer(id);
      if (!payload.overwrite_draft && needsOverwriteConfirm(e)) {
        const msg =
          "일부 서비스에 작업본이 있습니다. 덮어쓰려면 다시 실행하세요.";
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "error" as const,
                  needsOverwrite: true,
                  error: msg,
                  log: [...j.log, logLine(msg)],
                }
              : j,
          ),
        }));
        return;
      }
      const message =
        e instanceof ApiError
          ? e.message
          : "Postman 가져오기에 실패했습니다.";
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: "error" as const,
                needsOverwrite: false,
                error: message,
                log: [...j.log, logLine(message)],
              }
            : j,
        ),
      }));
    }
  },

  startPostmanJob: (payload) => {
    const id = newJobId("postman");
    const stages = buildPostmanImportJobStages();
    const fileLabel = payload.fileName?.trim() || "Postman";
    const job: YamlAiJob = {
      id,
      kind: "postman",
      serviceCode: fileLabel,
      status: "running",
      startedAt: Date.now(),
      stages,
      stageIndex: 0,
      progress: 8,
      useDataPool: false,
      useSwagger: false,
      postmanCollection: payload.collection,
      postmanEnvironment: payload.environment ?? null,
      postmanFileName: payload.fileName ?? null,
      postmanEnvironmentFileName: payload.environmentFileName ?? null,
      needsOverwrite: false,
      log: [
        logLine(
          payload.overwrite_draft
            ? `${fileLabel} 가져오기를 다시 시작합니다 (작업본 덮어쓰기).`
            : `${fileLabel} 가져오기를 시작합니다.`,
        ),
        logLine(stages[0]?.detail?.trim() || "Collection을 파싱합니다."),
      ],
    };
    set((s) => ({ jobs: [job, ...s.jobs] }));
    scheduleStageTick(id, 900);
    void get().runPostmanImport(id, payload);
    return id;
  },

  retryOverwrite: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;

    if (job.kind === "source") {
      const payload = job.sourcePayload;
      if (!payload?.source_code) return;
      clearStageTimer(id);
      const stages = buildYamlAiJobStages(payload);
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                status: "running" as const,
                error: undefined,
                needsOverwrite: false,
                stageIndex: 0,
                progress: 8,
                stages,
                bundle: undefined,
                sourcePayload: { ...payload, overwrite_draft: true },
                log: [
                  ...j.log,
                  logLine("기존 작업본에 병합하여 다시 생성합니다."),
                  logLine(stages[0]?.detail?.trim() || "카탈로그를 확인합니다."),
                ],
              }
            : j,
        ),
      }));
      scheduleStageTick(id, 900);
      // Re-enter startJob flow by calling generate with overwrite; keep same job id.
      void (async () => {
        try {
          const bundle = await generateServiceRulesDraftFromSource(
            payload.serviceCode.trim(),
            {
              source_code: payload.source_code,
              source_version: payload.source_version ?? null,
              hints: payload.hints ?? null,
              created_by: payload.created_by ?? null,
              use_data_pool: payload.use_data_pool ?? false,
              use_swagger: payload.use_swagger ?? false,
              overwrite_draft: true,
            },
          );
          if (!get().jobs.some((j) => j.id === id)) return;
          clearStageTimer(id);
          set((s) => ({
            jobs: s.jobs.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status: "success" as const,
                    bundle,
                    needsOverwrite: false,
                    error: undefined,
                    stageIndex: j.stages.length - 1,
                    progress: 100,
                    log: [
                      ...j.log,
                      logLine(
                        `작업본 저장 완료 · v${bundle.version ?? "—"} (기존 케이스와 병합).`,
                      ),
                    ],
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
                ? {
                    ...j,
                    status: "error" as const,
                    needsOverwrite: false,
                    error: message,
                    log: [...j.log, logLine(message)],
                  }
                : j,
            ),
          }));
        }
      })();
      return;
    }

    if (job.kind !== "postman" || job.postmanCollection == null) {
      return;
    }
    clearStageTimer(id);
    const stages = buildPostmanImportJobStages();
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status: "running" as const,
              error: undefined,
              needsOverwrite: false,
              stageIndex: 0,
              progress: 8,
              stages,
              bundle: undefined,
              postmanResult: undefined,
              log: [
                ...j.log,
                logLine("작업본 덮어쓰기로 다시 가져옵니다."),
                logLine(stages[0]?.detail?.trim() || "Collection을 파싱합니다."),
              ],
            }
          : j,
      ),
    }));
    scheduleStageTick(id, 900);
    void get().runPostmanImport(id, {
      collection: job.postmanCollection,
      environment: job.postmanEnvironment ?? null,
      fileName: job.postmanFileName,
      environmentFileName: job.postmanEnvironmentFileName,
      overwrite_draft: true,
    });
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
