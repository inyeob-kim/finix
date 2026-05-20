import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Send } from "lucide-react";
import {
  getManualStatus,
  postManualChat,
  type ManualChatTurnDto,
  type ManualSourceSnippetDto,
} from "@/api/manualApi";
import { ApiError } from "@/api/client";
import { PageShell } from "./PageShell";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixLoading } from "./ui/finix-loading";
import { FinixUnderlineTextarea } from "./ui/finix-form";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ManualSourceSnippetDto[];
};

const SUGGESTIONS = [
  "YAML 등록하는 방법 알려줘",
  "테스트케이스는 어떻게 생성하나요?",
  "YAML draft와 Active 차이는?",
  "시나리오부터 실행까지 흐름을 알려줘",
];

export function ManualChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await getManualStatus();
        if (cancelled) return;
        setStatusText(
          st.indexed
            ? `매뉴얼 인덱스 ${st.chunk_count}개 섹션`
            : "첫 질문 시 매뉴얼을 인덱싱합니다",
        );
      } catch {
        if (!cancelled) setStatusText(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: q,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setError(null);
      focusInput();

      const history: ManualChatTurnDto[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await postManualChat({ message: q, history });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: res.answer,
            sources: res.sources,
          },
        ]);
        const st = await getManualStatus();
        setStatusText(
          st.indexed
            ? `매뉴얼 인덱스 ${st.chunk_count}개 섹션`
            : statusText,
        );
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.message
            : "매뉴얼 답변을 가져오지 못했습니다.",
        );
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [focusInput, loading, messages, statusText],
  );

  return (
    <PageShell
      icon={<BookOpen className="w-5 h-5" strokeWidth={2} />}
      title="매뉴얼"
      description="FINIX 설계·운영 문서를 기반으로 질문합니다."
      containerClassName="flex-1 min-h-0 flex flex-col h-full"
      contentClassName="flex flex-col flex-1 min-h-0"
    >
      <div className="w-full max-w-4xl mx-auto flex flex-col flex-1 min-h-0 min-h-[28rem]">
      <div className="flex flex-col flex-1 min-h-0 w-full rounded-sm border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-sm text-muted-foreground">
                플랫폼 사용법, YAML 규칙, 테스트케이스 생성, 시나리오 흐름 등을
                물어보세요.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-sm border border-border bg-background hover:bg-muted transition-colors"
                    onClick={() => void sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-sm px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted border border-border"
                }`}
              >
                {m.content}
                {m.sources && m.sources.length > 0 ? (
                  <div className="mt-3 pt-2 border-t border-border/60 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      참고 섹션
                    </p>
                    {m.sources.map((s) => (
                      <p
                        key={`${s.chunk_index}-${s.header_path}`}
                        className="text-xs text-muted-foreground"
                      >
                        · {s.header_path}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-sm px-4 py-3 bg-muted border border-border text-sm text-muted-foreground flex items-center gap-2">
                <FinixLoading size="sm" label="답변 생성 중…" inline />
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-border bg-card">
          {error ? (
            <p className="px-4 text-sm text-destructive py-2">{error}</p>
          ) : null}

          <form
            className="p-4 flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
          <FinixUnderlineTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            className="min-h-[2.75rem] flex-1"
            placeholder="질문을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
          />
          <FinixPrimaryButton
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 px-5 shrink-0 gap-2"
          >
            <Send className="w-4 h-4" />
            전송
          </FinixPrimaryButton>
          </form>

          {statusText ? (
            <p className="text-[11px] text-muted-foreground text-center pb-2 px-4">
              {statusText}
            </p>
          ) : null}
        </div>
      </div>
      </div>
    </PageShell>
  );
}
