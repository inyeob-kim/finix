import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  createCollectionVarGenerator,
  deleteCollectionVarGenerator,
  draftCollectionVarGenerator,
  listCollectionVarGenerators,
  previewCollectionVarGenerator,
  type CollectionVarGeneratorDraftDto,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import { ApiError } from "@/api/client";
import {
  COLLECTION_VAR_GENERATORS,
  collectionVarSourceLabel,
  resolveCollectionVarGenerator,
} from "@/lib/collectionVarGenerators";
import { formatPostmanVar } from "@/lib/postmanBodyBindings";
import type { PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";
import {
  isValidCollectionVarKey,
  type CollectionVarDeclarePayload,
} from "./CollectionVarAddField";

const AI_MODE = "__ai__";

function previewValueFromResponse(
  res: { value?: string } | null | undefined,
): string {
  return typeof res?.value === "string" ? res.value : "";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionVars: readonly PostmanStartVar[];
  onAdd: (payload: CollectionVarDeclarePayload) => void;
  onRemove?: (key: string) => void;
};

export function CollectionVarDeclareDialog({
  open,
  onOpenChange,
  collectionVars,
  onAdd,
  onRemove,
}: Props) {
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<string>("literal");
  const [literalValue, setLiteralValue] = useState("");
  const [catalog, setCatalog] = useState<CollectionVarGeneratorDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState<CollectionVarGeneratorDraftDto | null>(
    null,
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const previewReqId = useRef(0);

  const reloadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const items = await listCollectionVarGenerators();
      setCatalog(items);
    } catch {
      setCatalog(
        COLLECTION_VAR_GENERATORS.map((g) => ({
          key: g.id,
          label: g.label,
          description: g.hint,
          hint: g.hint,
          source: "builtin" as const,
          impl_kind: g.id,
        })),
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setKey("");
    setMode("literal");
    setLiteralValue("");
    setAiPrompt("");
    setAiDraft(null);
    setAiError(null);
    setPreviewValue(null);
    setPreviewError(null);
    setCatalogError(null);
    previewReqId.current += 1;
    void reloadCatalog();
  }, [open]);

  const generator = mode === "literal" || mode === AI_MODE ? null : mode;
  const selectedMeta = catalog.find((g) => g.key === generator);
  const sharedCatalog = catalog.filter((g) => g.source === "shared");
  const canSubmit =
    isValidCollectionVarKey(key) &&
    (generator != null || literalValue.trim().length > 0);

  const removeSharedGenerator = async (generatorKey: string) => {
    setDeletingKey(generatorKey);
    setCatalogError(null);
    try {
      await deleteCollectionVarGenerator(generatorKey);
      await reloadCatalog();
      if (mode === generatorKey) {
        setMode("literal");
        setPreviewValue(null);
      }
    } catch (e) {
      setCatalogError(
        e instanceof ApiError ? e.message : "공유 생성기 삭제에 실패했습니다.",
      );
    } finally {
      setDeletingKey(null);
    }
  };

  const loadPreviewForKey = async (
    generatorKey: string,
    metaHint?: CollectionVarGeneratorDto | null,
  ) => {
    const reqId = ++previewReqId.current;
    const local = resolveCollectionVarGenerator(generatorKey);
    if (local) {
      setPreviewValue(local);
      setPreviewError(null);
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const meta =
        metaHint ?? catalog.find((g) => g.key === generatorKey) ?? null;
      const res = await previewCollectionVarGenerator(
        meta?.impl_kind
          ? {
              key: generatorKey,
              impl_kind: meta.impl_kind,
              impl: meta.impl ?? {},
            }
          : { key: generatorKey },
      );
      if (reqId !== previewReqId.current) return;
      const value = previewValueFromResponse(res) || local;
      setPreviewValue(value || null);
      if (!value) {
        setPreviewError("미리보기 값이 비어 있습니다.");
      }
    } catch (e) {
      if (reqId !== previewReqId.current) return;
      if (local) {
        setPreviewValue(local);
        setPreviewError(null);
        return;
      }
      setPreviewValue(null);
      setPreviewError(
        e instanceof ApiError ? e.message : "미리보기를 불러오지 못했습니다.",
      );
    } finally {
      if (reqId === previewReqId.current) setPreviewBusy(false);
    }
  };

  const loadPreviewForDraft = async (draft: CollectionVarGeneratorDraftDto) => {
    const reqId = ++previewReqId.current;
    const fallback = (draft.sample_preview || "").trim();
    if (fallback) {
      setPreviewValue(fallback);
      setPreviewError(null);
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const res = await previewCollectionVarGenerator({
        impl_kind: draft.impl_kind,
        impl: draft.impl ?? {},
      });
      if (reqId !== previewReqId.current) return;
      const value = previewValueFromResponse(res) || fallback;
      setPreviewValue(value || null);
      if (!value) {
        setPreviewError("미리보기 값이 비어 있습니다.");
      }
    } catch (e) {
      if (reqId !== previewReqId.current) return;
      if (fallback) {
        setPreviewValue(fallback);
        setPreviewError(null);
        return;
      }
      setPreviewValue(null);
      setPreviewError(
        e instanceof ApiError ? e.message : "미리보기를 불러오지 못했습니다.",
      );
    } finally {
      if (reqId === previewReqId.current) setPreviewBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (mode === "literal" || mode === AI_MODE) {
      if (mode !== AI_MODE) {
        setPreviewValue(null);
        setPreviewError(null);
      }
      return;
    }
    void loadPreviewForKey(mode);
    // Re-fetch when catalog arrives so shared impl is included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, catalog]);

  const submit = () => {
    if (!canSubmit || (!generator && !literalValue.trim())) return;
    if (!isValidCollectionVarKey(key)) return;
    onAdd({
      key: key.trim(),
      value: generator ? "" : literalValue.trim(),
      generator,
    });
    setKey("");
    setLiteralValue("");
    setMode("literal");
  };

  const runAiDraft = async () => {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    setPreviewValue(null);
    try {
      const draft = await draftCollectionVarGenerator(aiPrompt.trim());
      setAiDraft(draft);
      if (draft.sample_preview) setPreviewValue(draft.sample_preview);
      await loadPreviewForDraft(draft);
    } catch (e) {
      setAiDraft(null);
      setAiError(
        e instanceof ApiError ? e.message : "AI 초안을 만들지 못했습니다.",
      );
    } finally {
      setAiBusy(false);
    }
  };

  const saveAiDraft = async () => {
    if (!aiDraft) return;
    const label = aiDraft.label.trim();
    if (!label) {
      setAiError("목록에 표시할 이름을 입력하세요.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const saved = await createCollectionVarGenerator({
        key: aiDraft.key,
        label,
        description: aiDraft.description,
        prompt: aiPrompt.trim(),
        impl_kind: aiDraft.impl_kind,
        impl: aiDraft.impl,
      });
      await reloadCatalog();
      setMode(saved.key);
      setAiDraft(null);
      setAiPrompt("");
    } catch (e) {
      setAiError(
        e instanceof ApiError ? e.message : "생성기 저장에 실패했습니다.",
      );
    } finally {
      setAiBusy(false);
    }
  };

  const previewBlock = (
    <div className="flex items-start gap-2 rounded-sm border border-border bg-background px-2.5 py-2 text-[11px]">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-muted-foreground">미리보기 (실행 시 다시 생성)</p>
        {previewBusy && !previewValue ? (
          <FinixLoading size="sm" inline label="생성 중…" />
        ) : previewError && !previewValue ? (
          <p className="text-destructive">{previewError}</p>
        ) : (
          <p className="font-mono text-sm text-foreground break-all">
            {previewValue != null && previewValue !== "" ? previewValue : "—"}
          </p>
        )}
        {previewBusy && previewValue ? (
          <p className="text-[10px] text-muted-foreground">갱신 중…</p>
        ) : null}
        {previewError && previewValue ? (
          <p className="text-[10px] text-destructive">{previewError}</p>
        ) : null}
      </div>
      {generator || aiDraft ? (
        <button
          type="button"
          className="p-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={previewBusy}
          aria-label="미리보기 새로고침"
          onClick={() => {
            if (aiDraft && mode === AI_MODE) {
              void loadPreviewForDraft(aiDraft);
              return;
            }
            if (generator) void loadPreviewForKey(generator);
          }}
        >
          <RefreshCw className={`size-3.5 ${previewBusy ? "animate-spin" : ""}`} />
        </button>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md rounded-sm flex flex-col gap-0 p-0 overflow-hidden h-[min(640px,90vh)] max-h-[min(640px,90vh)]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="pr-8">컬렉션 변수 추가</DialogTitle>
          <DialogDescription>
            고정값·내장/공유 동적 생성기를 선택하거나, AI로 새 생성기를 만들어
            공유 목록에 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 space-y-4">
          <section className="space-y-2">
            <label className="text-xs font-medium">변수명</label>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs text-muted-foreground">
                {"{{"}
              </span>
              <FinixUnderlineInput
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="custRrn"
                className="font-mono text-xs flex-1"
                spellCheck={false}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {"}}"}
              </span>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium">값 출처</label>
              <button
                type="button"
                className={`h-7 shrink-0 px-2 rounded-sm border text-[11px] font-medium transition-colors ${
                  mode === AI_MODE
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => {
                  if (mode === AI_MODE) {
                    setMode("literal");
                    setAiDraft(null);
                    setAiError(null);
                    setPreviewValue(null);
                    setPreviewError(null);
                    return;
                  }
                  setMode(AI_MODE);
                  setPreviewValue(null);
                  setPreviewError(null);
                }}
              >
                AI로 만들기
              </button>
            </div>
            {mode === AI_MODE ? (
              <div className="space-y-2 rounded-sm border border-dashed border-border p-2.5">
                <textarea
                  className="min-h-[72px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="예: 오늘로부터 3개월 뒤 날짜를 YYYYMMDD로"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={aiBusy || aiPrompt.trim().length < 3}
                    className="h-8 px-3 rounded-sm border border-primary/40 text-xs font-medium hover:bg-primary/10 disabled:opacity-40"
                    onClick={() => void runAiDraft()}
                  >
                    {aiBusy ? "생성 중…" : "초안 만들기"}
                  </button>
                  {aiDraft ? (
                    <button
                      type="button"
                      disabled={aiBusy || aiDraft.label.trim().length === 0}
                      className="h-8 px-3 rounded-sm bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
                      onClick={() => void saveAiDraft()}
                    >
                      공유 목록에 저장
                    </button>
                  ) : null}
                </div>
                {aiBusy ? <FinixLoading size="sm" inline label="처리 중…" /> : null}
                {aiError ? (
                  <p className="text-[11px] text-destructive">{aiError}</p>
                ) : null}
                {aiDraft ? (
                  <div className="space-y-2">
                    <div className="space-y-2 text-[11px] rounded-sm bg-muted/40 px-2 py-1.5">
                      <div className="space-y-1">
                        <label className="text-muted-foreground">목록 표시 이름</label>
                        <FinixUnderlineInput
                          value={aiDraft.label}
                          onChange={(e) =>
                            setAiDraft({ ...aiDraft, label: e.target.value })
                          }
                          placeholder="예: 3개월 후 날짜"
                          className="text-xs"
                          spellCheck={false}
                        />
                      </div>
                      <p>
                        <span className="text-muted-foreground">key </span>
                        <span className="font-mono">{aiDraft.key}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {aiDraft.description || "—"}
                        {" · "}
                        {aiDraft.source}
                      </p>
                    </div>
                    {previewBlock}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <select
                  className="h-9 w-full rounded-sm border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  value={mode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMode(next);
                    if (next !== "literal") {
                      const local = resolveCollectionVarGenerator(next);
                      if (local) {
                        setPreviewValue(local);
                        setPreviewError(null);
                      }
                    }
                  }}
                  disabled={catalogLoading}
                >
                  <option value="literal">고정값</option>
                  {catalog.map((g) => (
                    <option key={`${g.source}-${g.key}`} value={g.key}>
                      {g.source === "shared" ? `[공유] ${g.label}` : g.label}
                    </option>
                  ))}
                </select>
                {mode === "literal" ? (
                  <FinixUnderlineInput
                    value={literalValue}
                    onChange={(e) => setLiteralValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="고정값 입력"
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground leading-relaxed min-w-0">
                        {selectedMeta?.hint ||
                          selectedMeta?.description ||
                          "실행 시 1회 생성"}
                        {selectedMeta?.source === "shared"
                          ? " · 공유 생성기"
                          : ""}
                      </p>
                      {selectedMeta?.source === "shared" ? (
                        <button
                          type="button"
                          className="shrink-0 h-7 px-2 rounded-sm border border-border text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-40"
                          disabled={deletingKey === selectedMeta.key}
                          onClick={() =>
                            void removeSharedGenerator(selectedMeta.key)
                          }
                        >
                          {deletingKey === selectedMeta.key
                            ? "삭제 중…"
                            : "목록에서 삭제"}
                        </button>
                      ) : null}
                    </div>
                    {previewBlock}
                  </div>
                )}
              </>
            )}
            {catalogError ? (
              <p className="text-[11px] text-destructive">{catalogError}</p>
            ) : null}
          </section>

          {sharedCatalog.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-medium">
                공유 생성기 ({sharedCatalog.length})
              </h3>
              <ul className="space-y-1 border border-border/60 rounded-sm divide-y divide-border/60">
                {sharedCatalog.map((g) => (
                  <li
                    key={g.key}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] min-w-0"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left truncate hover:text-primary"
                      onClick={() => {
                        setMode(g.key);
                        setAiDraft(null);
                      }}
                      title={g.description || g.hint || g.key}
                    >
                      <span className="font-medium">{g.label}</span>
                      <span className="text-muted-foreground font-mono ml-1.5">
                        {g.key}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-40"
                      disabled={deletingKey === g.key}
                      onClick={() => void removeSharedGenerator(g.key)}
                      aria-label={`${g.label} 삭제`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-medium">
              등록된 변수
              {collectionVars.length > 0 ? ` (${collectionVars.length})` : ""}
            </h3>
            {collectionVars.length === 0 ? (
              <p className="text-[11px] text-muted-foreground border border-dashed rounded-sm px-2.5 py-2">
                아직 없습니다.
              </p>
            ) : (
              <ul className="space-y-1 border border-border/60 rounded-sm divide-y divide-border/60">
                {collectionVars.map((row) => {
                  const meta = catalog.find((g) => g.key === row.generator);
                  const source =
                    meta != null
                      ? `동적 · ${meta.label}`
                      : collectionVarSourceLabel(row);
                  const sample =
                    row.generator != null
                      ? resolveCollectionVarGenerator(row.generator)
                      : row.value;
                  return (
                    <li
                      key={row.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] min-w-0"
                    >
                      <span className="font-mono text-primary shrink-0">
                        {formatPostmanVar(row.key)}
                      </span>
                      <span className="text-muted-foreground truncate min-w-0 flex-1">
                        {source}
                        {sample ? (
                          <span className="font-mono text-foreground/80">
                            {" · "}
                            {sample}
                          </span>
                        ) : null}
                      </span>
                      {onRemove ? (
                        <button
                          type="button"
                          className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => onRemove(row.key)}
                          aria-label={`${row.key} 삭제`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2 border-t border-border gap-2">
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!canSubmit || mode === AI_MODE}
            className="h-9 px-4 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
            onClick={submit}
          >
            추가
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
