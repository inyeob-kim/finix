import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import type { CollectionHealthRow } from "@/lib/dashboardMetrics";
import { cn } from "../ui/utils";

type DashboardCollectionHealthProps = {
  rows: CollectionHealthRow[];
  loading?: boolean;
};

function MiniBar({
  ratio,
  tone,
  title,
}: {
  ratio: number;
  tone: "primary" | "success" | "destructive" | "muted";
  title: string;
}) {
  const width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  return (
    <div
      title={title}
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone === "primary" && "bg-primary",
          tone === "success" && "bg-success",
          tone === "destructive" && "bg-destructive",
          tone === "muted" && "bg-muted-foreground/40",
        )}
        style={{ width }}
      />
    </div>
  );
}

function passTone(row: CollectionHealthRow): "success" | "destructive" | "muted" {
  if (row.runs === 0) return "muted";
  if (row.passPercent < 80) return "destructive";
  return "success";
}

export function DashboardCollectionHealth({
  rows,
  loading,
}: DashboardCollectionHealthProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading && rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        컬렉션 헬스 계산 중…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        레지스트리에 시나리오가 없습니다.{" "}
        <Link to="/scenario-registry" className="text-primary hover:underline">
          시나리오 관리
        </Link>
        에서 컬렉션을 만들어 보세요.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {rows.map((row, index) => {
        const readyRatio =
          row.scenarioCount > 0 ? row.readyCount / row.scenarioCount : 0;
        const passRatio = row.runs > 0 ? row.passed / row.runs : 0;
        return (
          <motion.li
            key={row.folderId}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              delay: prefersReducedMotion ? 0 : index * 0.04,
              ease: "easeOut",
            }}
            className="px-4 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium">{row.folderName}</p>
              <p
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  row.runs === 0 && "text-muted-foreground",
                  row.runs > 0 && row.passPercent < 80 && "text-destructive",
                  row.runs > 0 && row.passPercent >= 80 && "text-success",
                )}
              >
                {row.passDisplay}
              </p>
            </div>

            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              시나리오 {row.scenarioCount} · 완료 {row.readyCount} · 초안{" "}
              {row.draftCount}
              {row.unboundCount > 0 ? ` · 미연결 ${row.unboundCount}` : ""}
              {" · "}
              {row.runs > 0 ? `실행 ${row.runs}` : "실행 없음"}
            </p>

            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <MiniBar
                ratio={readyRatio}
                tone="primary"
                title={`완료율 ${row.readyDisplay} (${row.readyCount}/${row.scenarioCount})`}
              />
              <MiniBar
                ratio={passRatio}
                tone={passTone(row)}
                title={
                  row.runs > 0
                    ? `통과율 ${row.passDisplay} (${row.passed}/${row.runs})`
                    : "기간 내 실행 없음"
                }
              />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
