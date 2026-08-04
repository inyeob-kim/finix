import { ApiError } from "@/api/client";
import {
  createCollectionVarGenerator,
  draftCollectionVarGenerator,
  type CollectionVarGeneratorDraftDto,
  type CollectionVarGeneratorDto,
} from "@/api/collectionVarGeneratorApi";
import { useState } from "react";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";

type Props = {
  disabled?: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSaved: (generator: CollectionVarGeneratorDto) => void;
  onUseExisting: (key: string) => void;
};

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

  const runAiDraft = async () => {
    if (prompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    setAiIgnoreRecommendations(false);
    try {
      setAiDraft(await draftCollectionVarGenerator(prompt.trim()));
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
      onSaved(saved);
    } catch (e) {
      setAiError(
        e instanceof ApiError ? e.message : "생성기 저장에 실패했습니다.",
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
                className="rounded-sm border border-border bg-muted/30 px-2.5 py-2 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium">{rec.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {rec.key}
                    {rec.source === "shared" ? " · 공유" : " · 내장"}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 h-7 px-2 rounded-sm bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
                  onClick={() => onUseExisting(rec.key)}
                >
                  사용
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={aiBusy}
            className="h-8 px-3 rounded-sm border border-border text-xs font-medium hover:bg-muted disabled:opacity-40"
            onClick={() => setAiIgnoreRecommendations(true)}
          >
            추천 말고 새로 만들기
          </button>
        </div>
      ) : null}

      {showAiNewDraft && aiDraft ? (
        <div className="space-y-1.5 text-[11px] rounded-sm bg-muted/40 px-2 py-1.5">
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
          <p>
            <span className="text-muted-foreground">key </span>
            <span className="font-mono">{aiDraft.key}</span>
            {aiDraft.sample_preview ? (
              <>
                {" · 예: "}
                <span className="font-mono">{aiDraft.sample_preview}</span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
