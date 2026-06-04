import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import type { FlowValueRef } from "@/lib/scenarioFlowUx";
import { FLOW_KEY_VARS_VISIBLE, linkReasonLines } from "@/lib/scenarioFlowUx";
import { cn } from "../ui/utils";

type Props = {
  title: string;
  items: FlowValueRef[];
  /** Muted section (사용 변수) vs default (생성 변수). */
  tone?: "created" | "used";
};

export function FlowVariableGroup({ title, items, tone = "created" }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [reasonVar, setReasonVar] = useState<string | null>(null);

  if (items.length === 0) return null;

  const keyFirst = [...items].sort((a, b) => {
    if (a.isKey === b.isKey) return a.var.localeCompare(b.var);
    return a.isKey ? -1 : 1;
  });

  const defaultVisible =
    keyFirst.filter((i) => i.isKey).length > 0
      ? keyFirst.filter((i) => i.isKey)
      : keyFirst.slice(0, FLOW_KEY_VARS_VISIBLE);

  const visible = showAll ? keyFirst : defaultVisible;
  const hiddenCount = items.length - visible.length;

  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          tone === "used" ? "text-primary/80" : "text-muted-foreground",
        )}
      >
        {title}
        <span className="font-normal normal-case ml-1 text-muted-foreground">
          {items.length}개
        </span>
      </p>
      <ul className="space-y-0.5">
        {visible.map((item) => (
          <li key={item.var} className="flex items-start gap-1.5 text-xs">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span
              className={cn(
                "font-mono",
                item.isKey
                  ? "font-semibold text-foreground"
                  : "text-foreground/80",
              )}
            >
              {item.var}
            </span>
            {item.auto ? (
              <CheckCircle2
                className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5"
                aria-label="자동 연결"
              />
            ) : null}
            {item.link ? (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 shrink-0"
                onClick={() =>
                  setReasonVar((v) => (v === item.var ? null : item.var))
                }
              >
                <Info className="w-3 h-3" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {reasonVar ? (
        <ul className="text-[10px] text-muted-foreground list-disc list-inside pl-2">
          {(() => {
            const link = items.find((i) => i.var === reasonVar)?.link;
            if (!link) return null;
            return linkReasonLines(link).map((line) => (
              <li key={line}>{line}</li>
            ));
          })()}
        </ul>
      ) : null}
      {hiddenCount > 0 && !showAll ? (
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={() => setShowAll(true)}
        >
          + {hiddenCount}개 더 보기
        </button>
      ) : null}
      {showAll && items.length > FLOW_KEY_VARS_VISIBLE ? (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => setShowAll(false)}
        >
          핵심만 보기
        </button>
      ) : null}
    </div>
  );
}
