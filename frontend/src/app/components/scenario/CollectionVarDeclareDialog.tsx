import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  deleteCollectionVarGenerator,
  previewCollectionVarGenerator,
  updateCollectionVarGenerator,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import { ApiError } from "@/api/client";
import {
  collectionVarGeneratorLabel,
  collectionVarSourceLabel,
  resolveCollectionVarGenerator,
} from "@/lib/collectionVarGenerators";
import { splitGeneratorRef } from "@/lib/generatorRef";
import { formatPostmanVar } from "@/lib/postmanBodyBindings";
import type { PostmanStartVar } from "@/lib/scenarioPostmanVariables";
import {
  DynamicGeneratorSourcePanel,
  type DynamicGeneratorSelection,
} from "../dynamicValue/DynamicGeneratorSourcePanel";
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
import { CollectionVarGeneratorSourcePanel } from "./CollectionVarGeneratorSourcePanel";

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

/**
 * Fixed two-column declare dialog:
 * left = variable name + selection result, right = value source picker.
 */
const DIALOG_CLASS =
  "flex h-[min(40rem,92vh)] max-h-[min(40rem,92vh)] w-[min(56rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-sm p-0 sm:max-w-none";

export function CollectionVarDeclareDialog({
  open,
  onOpenChange,
  collectionVars,
  onAdd,
  onRemove,
}: Props) {
  const [key, setKey] = useState("");
  const [literalValue, setLiteralValue] = useState("");
  const [selection, setSelection] = useState<DynamicGeneratorSelection | null>(
    null,
  );
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [panelReset, setPanelReset] = useState(0);
  const previewReqId = useRef(0);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKey("");
    setLiteralValue("");
    setSelection(null);
    setPreviewValue(null);
    setPreviewError(null);
    setCatalogError(null);
    setSourceOpen(false);
    setSourceError(null);
    previewReqId.current += 1;
    setPanelReset((n) => n + 1);
  }, [open]);

  const mode = selection?.mode ?? "literal";
  const aiMode = selection?.aiActive ?? false;
  const catalog = selection?.catalog ?? [];
  const generator = selection?.generator ?? null;
  const selectedMeta =
    generator == null
      ? undefined
      : catalog.find((g) => {
          const base = splitGeneratorRef(generator).base;
          return g.key === base || g.key === generator;
        });
  const canSubmit =
    isValidCollectionVarKey(key) &&
    !aiMode &&
    (generator != null || literalValue.trim().length > 0);

  const saveSharedSource = async () => {
    if (!selectedMeta || selectedMeta.source !== "shared") return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      const saved = await updateCollectionVarGenerator(selectedMeta.key, {
        impl_kind: selectedMeta.impl_kind ?? selectedMeta.key,
        impl: selectedMeta.impl ?? {},
        label: selectedMeta.label,
        description: selectedMeta.description,
        prompt: selectedMeta.prompt ?? undefined,
      });
      setSelection((prev) =>
        prev
          ? {
              ...prev,
              catalog: prev.catalog.map((g) =>
                g.key === saved.key ? { ...g, ...saved } : g,
              ),
            }
          : prev,
      );
      await loadPreviewForKey(saved.key, saved);
    } catch (e) {
      setSourceError(
        e instanceof ApiError ? e.message : "소스 저장에 실패했습니다.",
      );
    } finally {
      setSourceBusy(false);
    }
  };

  const removeSharedGenerator = async (generatorKey: string) => {
    setDeletingKey(generatorKey);
    setCatalogError(null);
    try {
      await deleteCollectionVarGenerator(generatorKey);
      setPanelReset((n) => n + 1);
      setPreviewValue(null);
      setSourceOpen(false);
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
    const { base, namePart } = splitGeneratorRef(generatorKey);
    // Name parts: client-side preview is authoritative (API returns full name only).
    if (base === "korean_name" && namePart !== "full") {
      setPreviewBusy(false);
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const meta =
        metaHint ??
        catalog.find((g) => g.key === base || g.key === generatorKey) ??
        null;
      const res = await previewCollectionVarGenerator(
        meta?.impl_kind
          ? {
              key: base || generatorKey,
              impl_kind: meta.impl_kind,
              impl: meta.impl ?? {},
            }
          : { key: base || generatorKey },
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

  useEffect(() => {
    if (!open || aiMode) return;
    if (!generator) {
      setPreviewValue(null);
      setPreviewError(null);
      return;
    }
    void loadPreviewForKey(generator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, generator, catalog, aiMode]);

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
    setSourceOpen(false);
    setPanelReset((n) => n + 1);
    requestAnimationFrame(() => keyInputRef.current?.focus());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={DIALOG_CLASS}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // After dialog mounts; picker must not steal focus (autoFocusSearch=false).
          window.setTimeout(() => keyInputRef.current?.focus(), 0);
        }}
      >        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pt-5 pb-3">
          <DialogTitle className="pr-8">컬렉션 변수 추가</DialogTitle>
          <DialogDescription>
            왼쪽에서 변수명을 정하고, 오른쪽에서 고정값 또는 동적 생성기를
            고릅니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: declare form */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              <section className="space-y-2">
                <label className="text-xs font-medium" htmlFor="cv-declare-key">
                  변수명
                </label>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs text-muted-foreground">
                    {"{{"}
                  </span>
                  <FinixUnderlineInput
                    id="cv-declare-key"
                    ref={keyInputRef}
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
                <label className="text-xs font-medium">값</label>
                {aiMode ? (
                  <p className="rounded-sm border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                    오른쪽에서 AI 초안을 만들거나 기존 생성기를 선택하세요.
                  </p>
                ) : mode === "literal" ? (
                  <FinixUnderlineInput
                    value={literalValue}
                    onChange={(e) => setLiteralValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="직접 입력하거나 오른쪽에서 생성기 선택"
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2 rounded-sm border border-border bg-muted/20 px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {collectionVarGeneratorLabel(generator) ||
                            selectedMeta?.label ||
                            mode}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">
                          {selectedMeta?.hint ||
                            selectedMeta?.description ||
                            "실행 시 1회 생성"}
                          {selectedMeta?.source === "shared"
                            ? " · 공유 생성기"
                            : ""}
                        </p>
                      </div>
                      {selectedMeta?.source === "shared" ? (
                        <button
                          type="button"
                          className="h-7 shrink-0 rounded-sm border border-border px-2 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
                          disabled={deletingKey === selectedMeta.key}
                          onClick={() =>
                            void removeSharedGenerator(selectedMeta.key)
                          }
                        >
                          {deletingKey === selectedMeta.key
                            ? "삭제 중…"
                            : "삭제"}
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-start gap-2 rounded-sm border border-border bg-background px-2.5 py-2 text-[11px]">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-muted-foreground">결과 미리보기</p>
                        {previewBusy && !previewValue ? (
                          <FinixLoading size="sm" inline label="생성 중…" />
                        ) : previewError && !previewValue ? (
                          <p className="text-destructive">{previewError}</p>
                        ) : (
                          <p className="break-all font-mono text-sm text-foreground">
                            {previewValue != null && previewValue !== ""
                              ? previewValue
                              : "—"}
                          </p>
                        )}
                        {previewBusy && previewValue ? (
                          <p className="text-[10px] text-muted-foreground">
                            갱신 중…
                          </p>
                        ) : null}
                      </div>
                      {generator ? (
                        <button
                          type="button"
                          className="shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          disabled={previewBusy}
                          aria-label="미리보기 새로고침"
                          onClick={() => void loadPreviewForKey(generator)}
                        >
                          <RefreshCw
                            className={`size-3.5 ${previewBusy ? "animate-spin" : ""}`}
                          />
                        </button>
                      ) : null}
                    </div>

                    {selectedMeta ? (
                      <CollectionVarGeneratorSourcePanel
                        open={sourceOpen}
                        onOpenChange={setSourceOpen}
                        readOnly={selectedMeta.source !== "shared"}
                        implKind={selectedMeta.impl_kind ?? selectedMeta.key}
                        impl={selectedMeta.impl ?? {}}
                        error={sourceError}
                        saving={sourceBusy}
                        onChange={
                          selectedMeta.source === "shared"
                            ? (next) => {
                                setSelection((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        catalog: prev.catalog.map((g) =>
                                          g.key === selectedMeta.key
                                            ? {
                                                ...g,
                                                impl_kind: next.impl_kind,
                                                impl: next.impl,
                                              }
                                            : g,
                                        ),
                                      }
                                    : prev,
                                );
                                setSourceError(null);
                                void previewCollectionVarGenerator({
                                  impl_kind: next.impl_kind,
                                  impl: next.impl,
                                }).then((res) => {
                                  setPreviewValue(
                                    previewValueFromResponse(res) || null,
                                  );
                                });
                              }
                            : undefined
                        }
                        onSave={
                          selectedMeta.source === "shared"
                            ? saveSharedSource
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                )}
                {catalogError ? (
                  <p className="text-[11px] text-destructive">{catalogError}</p>
                ) : null}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium">
                  등록된 변수
                  {collectionVars.length > 0
                    ? ` (${collectionVars.length})`
                    : ""}
                </h3>
                {collectionVars.length === 0 ? (
                  <p className="rounded-sm border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">
                    아직 없습니다. 추가하면 여기에 쌓입니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-sm border border-border/60">
                    {collectionVars.map((row) => {
                      const source = collectionVarSourceLabel(row);
                      const sample =
                        row.generator != null
                          ? resolveCollectionVarGenerator(row.generator)
                          : row.value;
                      return (
                        <li
                          key={row.id}
                          className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-[11px]"
                        >
                          <span className="shrink-0 font-mono text-primary">
                            {formatPostmanVar(row.key)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
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
                              className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
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
          </div>

          {/* Right: shared generator source (same as YAML dynamic value) */}
          <div className="flex h-full min-h-0 w-[min(24rem,42%)] shrink-0 flex-col">
            <DynamicGeneratorSourcePanel
              title="값 출처"
              includeLiteral
              autoFocusSearch={false}
              resetToken={panelReset}
              initialMode="literal"
              className="min-h-0 flex-1"
              onSelectionChange={(next) => {
                setSelection(next);
                setSourceError(null);
                if (next.mode === "literal" || next.aiActive) {
                  setSourceOpen(false);
                }
              }}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-3">
          <button
            type="button"
            className="h-9 rounded-sm border border-border px-4 text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="h-9 rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            onClick={submit}
          >
            추가
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
