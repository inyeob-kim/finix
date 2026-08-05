import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ApiError } from "@/api/client";
import {
  createCollectionVarGenerator,
  draftCollectionVarGenerator,
  previewCollectionVarGenerator,
  type CollectionVarGeneratorDraftDto,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import { CollectionVarGeneratorSourcePanel } from "../scenario/CollectionVarGeneratorSourcePanel";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  disabled?: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSaved: (generator: CollectionVarGeneratorDto) => void;
  onUseExisting: (key: string) => void;
};

function previewValueFromResponse(
  res: { value?: string } | null | undefined,
): string {
  return typeof res?.value === "string" ? res.value : "";
}

export function YamlMacroAiCreatePanel({
  disabled = false,
  prompt,
  onPromptChange,
  onSaved,
  onUseExisting,
}: Props) {
  const [aiDraft, setAiDraft] = useState<CollectionVarGeneratorDraftDto | null>(
    null,
  );
  const [aiIgnoreRecommendations, setAiIgnoreRecommendations] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const previewReqId = useRef(0);

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

  const runAiDraft = async () => {
    if (prompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    setPreviewValue(null);
    setPreviewError(null);
    setSourceOpen(false);
    setAiIgnoreRecommendations(false);
    try {
      const draft = await draftCollectionVarGenerator(prompt.trim());
      setAiDraft(draft);
      const showDraft =
        draft.has_draft !== false && Boolean(draft.impl_kind?.trim());
      const recs = draft.recommendations ?? [];
      if (recs.length > 0 && !showDraft) {
        setPreviewValue(recs[0]?.sample_preview?.trim() || null);
      } else if (showDraft) {
        if (draft.sample_preview) setPreviewValue(draft.sample_preview);
        await loadPreviewForDraft(draft);
      }
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
    if (!aiDraft?.impl_kind?.trim()) return;
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
        prompt: prompt.trim(),
        impl_kind: aiDraft.impl_kind,
        impl: aiDraft.impl,
      });
      setAiDraft(null);
      setAiIgnoreRecommendations(false);
      setSourceOpen(false);
      setPreviewValue(null);
      onSaved(saved);
    } catch (e) {
      setAiError(
        e instanceof ApiError ? e.message : "생성기 저장에 실패했습니다.",
      );
    } finally {
      setAiBusy(false);
    }
  };

  const startCreateNewInstead = async () => {
    if (aiDraft?.impl_kind?.trim()) {
      setAiIgnoreRecommendations(true);
      setPreviewValue(aiDraft.sample_preview?.trim() || null);
      await loadPreviewForDraft(aiDraft);
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const draft = await draftCollectionVarGenerator(
        `${prompt.trim()}\n(기존 생성기 추천은 쓰지 말고 새 생성기를 만드세요.)`,
      );
      setAiDraft(draft);
      setAiIgnoreRecommendations(true);
      if (draft.impl_kind?.trim()) {
        if (draft.sample_preview) setPreviewValue(draft.sample_preview);
        await loadPreviewForDraft(draft);
      } else {
        setAiError(
          "새 생성기 초안을 만들지 못했습니다. 요구를 더 구체적으로 적어 주세요.",
        );
      }
    } catch (e) {
      setAiError(
        e instanceof ApiError ? e.message : "AI 초안을 만들지 못했습니다.",
      );
    } finally {
      setAiBusy(false);
    }
  };

  const recommendations = aiDraft?.recommendations ?? [];
  const showAiRecommendations =
    recommendations.length > 0 && !aiIgnoreRecommendations;
  const showAiNewDraft =
    Boolean(aiDraft?.impl_kind?.trim()) &&
    (aiIgnoreRecommendations || recommendations.length === 0);

  return (
    <div className="space-y-2 rounded-sm border border-dashed border-border p-2.5">
      <textarea
        className="min-h-[64px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="예: 랜덤 영문 이름 / 오늘로부터 3개월 뒤 날짜"
        disabled={disabled || aiBusy}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || aiBusy || prompt.trim().length < 3}
          className="h-8 px-3 rounded-sm border border-primary/40 text-xs font-medium hover:bg-primary/10 disabled:opacity-40"
          onClick={() => void runAiDraft()}
        >
          {aiBusy ? "생성 중…" : "초안 만들기"}
        </button>
        {showAiNewDraft ? (
          <button
            type="button"
            disabled={disabled || aiBusy || !aiDraft?.label.trim()}
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

      {showAiRecommendations ? (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            이미 있는 생성기입니다. 사용하거나 새로 만들 수 있습니다.
          </p>
          <ul className="space-y-1.5">
            {recommendations.map((rec) => (
              <li
                key={rec.key}
                className="rounded-sm border border-border bg-muted/30 px-2.5 py-2 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{rec.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {rec.key}
                      {rec.source === "shared" ? " · 공유" : " · 내장"}
                    </p>
                    {rec.reason ? (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {rec.reason}
                      </p>
                    ) : null}
                    {rec.sample_preview ? (
                      <p className="text-[11px] font-mono mt-1 break-all">
                        예: {rec.sample_preview}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 h-7 px-2 rounded-sm bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
                    onClick={() => onUseExisting(rec.key)}
                  >
                    이 생성기 사용
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={aiBusy}
            className="h-8 px-3 rounded-sm border border-border text-xs font-medium hover:bg-muted disabled:opacity-40"
            onClick={() => void startCreateNewInstead()}
          >
            추천 말고 새로 만들기
          </button>
        </div>
      ) : null}

      {showAiNewDraft && aiDraft ? (
        <div className="space-y-2">
          <div className="space-y-2 text-[11px] rounded-sm bg-muted/40 px-2 py-1.5">
            <div className="space-y-1">
              <label className="text-muted-foreground">목록 표시 이름</label>
              <FinixUnderlineInput
                value={aiDraft.label}
                onChange={(e) =>
                  setAiDraft({ ...aiDraft, label: e.target.value })
                }
                placeholder="예: 영문 이름"
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
              {aiDraft.impl_kind}
              {" · "}
              {aiDraft.source}
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-sm border border-border bg-background px-2.5 py-2 text-[11px]">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-muted-foreground">
                결과 미리보기 (실행 시 다시 생성)
              </p>
              {previewBusy && !previewValue ? (
                <FinixLoading size="sm" inline label="생성 중…" />
              ) : previewError && !previewValue ? (
                <p className="text-destructive">{previewError}</p>
              ) : (
                <p className="font-mono text-sm text-foreground break-all">
                  {previewValue != null && previewValue !== ""
                    ? previewValue
                    : "—"}
                </p>
              )}
              {previewBusy && previewValue ? (
                <p className="text-[10px] text-muted-foreground">갱신 중…</p>
              ) : null}
              {previewError && previewValue ? (
                <p className="text-[10px] text-destructive">{previewError}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="p-1 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={previewBusy || disabled}
              aria-label="미리보기 새로고침"
              onClick={() => void loadPreviewForDraft(aiDraft)}
            >
              <RefreshCw
                className={`size-3.5 ${previewBusy ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <CollectionVarGeneratorSourcePanel
            open={sourceOpen}
            onOpenChange={setSourceOpen}
            implKind={aiDraft.impl_kind}
            impl={aiDraft.impl}
            onChange={(next) => {
              const updated = { ...aiDraft, ...next };
              setAiDraft(updated);
              void loadPreviewForDraft(updated);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
