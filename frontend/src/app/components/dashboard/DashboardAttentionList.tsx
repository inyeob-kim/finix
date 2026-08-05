import type { ReactNode } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronRight, FileWarning, Layers } from "lucide-react";
import type { ExecutionHistoryRow } from "@/lib/executionHistoryView";
import type { ServiceRuleRegistryItemDto } from "@/api/serviceRulesApi";

export type CoverageGap = {
  service_code: string;
  happy: number;
  negative: number;
};

type DashboardAttentionListProps = {
  failedRuns: ExecutionHistoryRow[];
  draftRules: ServiceRuleRegistryItemDto[];
  coverageGaps: CoverageGap[];
  loading?: boolean;
};

const ROWS_PER_GROUP = 4;

function GroupHeader({
  label,
  count,
  linkTo,
  linkLabel,
}: {
  label: string;
  count: number;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-muted/30 px-4 py-1.5">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {count > 0 ? (
          <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] tabular-nums text-foreground">
            {count}
          </span>
        ) : null}
      </div>
      {count > 0 ? (
        <Link
          to={linkTo}
          className="text-[11px] text-muted-foreground hover:text-primary"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

function AttentionRow({
  to,
  icon,
  title,
  meta,
  index,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  meta: string;
  index: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.25,
        delay: prefersReducedMotion ? 0 : index * 0.035,
        ease: "easeOut",
      }}
    >
      <Link
        to={to}
        className="group flex items-center gap-3 border-b border-border/50 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {meta}
          </span>
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-xs text-muted-foreground">{children}</p>;
}

export function DashboardAttentionList({
  failedRuns,
  draftRules,
  coverageGaps,
  loading,
}: DashboardAttentionListProps) {
  if (loading && failedRuns.length === 0 && draftRules.length === 0) {
    return (
      <p className="px-4 py-6 text-xs text-muted-foreground">
        할 일 불러오는 중…
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <GroupHeader
        label="실패 실행"
        count={failedRuns.length}
        linkTo="/history"
        linkLabel="이력 전체"
      />
      {failedRuns.length === 0 ? (
        <EmptyHint>최근 기간에 실패한 실행이 없습니다.</EmptyHint>
      ) : (
        failedRuns.slice(0, ROWS_PER_GROUP).map((run, index) => (
          <AttentionRow
            key={run.id}
            index={index}
            to={`/execution-result/${run.id}`}
            icon={<AlertTriangle className="size-3.5 text-destructive" />}
            title={run.scenarioTitle}
            meta={`#${run.id} · ${run.summary} · ${run.occurredAt}`}
          />
        ))
      )}

      <GroupHeader
        label="YAML 초안"
        count={draftRules.length}
        linkTo="/rules?status=draft"
        linkLabel="초안 목록"
      />
      {draftRules.length === 0 ? (
        <EmptyHint>대기 중인 YAML 초안이 없습니다.</EmptyHint>
      ) : (
        draftRules.slice(0, ROWS_PER_GROUP).map((item, index) => (
          <AttentionRow
            key={item.bundle_id}
            index={index}
            to="/rules?status=draft"
            icon={<FileWarning className="size-3.5 text-amber-600" />}
            title={item.service_name || item.service_code}
            meta={`${item.service_code} · v${item.bundle_version} · 규칙 ${item.rules}건`}
          />
        ))
      )}

      <GroupHeader
        label="커버리지 공백"
        count={coverageGaps.length}
        linkTo="/data-pool"
        linkLabel="Data Pool"
      />
      {coverageGaps.length === 0 ? (
        <EmptyHint>happy/negative 공백 서비스가 없습니다.</EmptyHint>
      ) : (
        coverageGaps.slice(0, ROWS_PER_GROUP).map((gap, index) => {
          const missing: string[] = [];
          if (gap.happy === 0) missing.push("happy");
          if (gap.negative === 0) missing.push("negative");
          return (
            <AttentionRow
              key={gap.service_code}
              index={index}
              to="/data-pool"
              icon={<Layers className="size-3.5" />}
              title={gap.service_code}
              meta={`${missing.join(" · ")} 샘플 없음 (H ${gap.happy} / N ${gap.negative})`}
            />
          );
        })
      )}
    </div>
  );
}
