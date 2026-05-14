import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Sparkles,
  ArrowRight,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { createScenario } from "@/api/scenarioApi";
import { ApiError } from "@/api/client";
import {
  FinixField,
  FinixUnderlineSelect,
  FinixUnderlineTextarea,
} from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";
import { PageShell } from "./PageShell";

export function Home() {
  const location = useLocation();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ruleVersion, setRuleVersion] = useState<"active" | "draft">("active");
  const navigate = useNavigate();

  const suggestedPrompts = [
    "출금 에러 테스트 생성해줘",
    "입금 성공/실패 시나리오 만들어줘",
  ];

  const handleGenerate = async () => {
    const q = input.trim();
    if (!q || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await createScenario({ prompt: q });
      navigate(`/scenario/${data.id}`, {
        state: { prompt: data.prompt ?? q, ruleVersion },
      });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "시나리오 생성에 실패했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
  };

  useEffect(() => {
    const fromRegistry = (location.state as { prompt?: string } | null)?.prompt;
    if (!fromRegistry?.trim()) return;
    setInput(fromRegistry);
  }, [location.state]);

  return (
    <PageShell
      icon={<Sparkles className="w-5 h-5" strokeWidth={2} />}
      title="AI 시나리오 생성"
      description="프롬프트로 시나리오를 만들고, 서비스 시퀀스 기반으로 테스트 케이스를 생성합니다."
    >
      <div className="w-full max-w-3xl mx-auto space-y-6">
        <div className="bg-card border border-border rounded-sm shadow-sm px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">생성 프롬프트</div>
              <div className="text-xs text-muted-foreground">
                ⌘/Ctrl + Enter로 바로 생성할 수 있습니다.
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              규칙:{" "}
              <span className="font-medium text-foreground">
                {ruleVersion === "active" ? "Active" : "Draft"}
              </span>
            </span>
          </div>

        {error && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

          <div className="mt-4">
            <FinixField label="프롬프트">
            <FinixUnderlineTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  void handleGenerate();
                }
              }}
              placeholder="어떤 테스트를 생성하시겠어요?"
              disabled={loading}
              className="h-32"
            />
          </FinixField>
          </div>
        </div>

        <FinixPrimaryButton
          onClick={() => void handleGenerate()}
          disabled={!input.trim() || loading}
          className="w-full h-12"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>생성 중…</span>
            </>
          ) : (
            <>
              <span>시나리오 생성</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </FinixPrimaryButton>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>고급 옵션</span>
              <span className="text-xs opacity-70">
                ({showAdvanced ? "숨김" : "열기"})
              </span>
            </button>
          </div>

          {showAdvanced && (
            <div className="bg-card border border-border rounded-sm shadow-sm px-4 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">규칙 버전</div>
                  <div className="text-xs text-muted-foreground">
                    기본은 Active. Draft는 미리보기/검증 용도로만 권장합니다.
                  </div>
                </div>

                <FinixField label="규칙 버전" className="min-w-[12rem]">
                  <FinixUnderlineSelect
                    value={ruleVersion}
                    onChange={(e) =>
                      setRuleVersion(e.target.value as "active" | "draft")
                    }
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </FinixUnderlineSelect>
                </FinixField>
              </div>

              {ruleVersion === "draft" && (
                <div className="rounded-sm border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                  Draft 규칙으로 생성된 시나리오는 결과가 불안정할 수 있습니다.
                  필요한 경우에만 사용하세요.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">추천 예시:</p>
          <div className="grid gap-3">
            {suggestedPrompts.map((prompt, index) => (
              <button
                type="button"
                key={index}
                onClick={() => handleSuggestion(prompt)}
                disabled={loading}
                className="px-4 py-3 bg-card border border-border rounded-sm text-left hover:border-primary/50 transition-colors shadow-sm disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm">{prompt}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
