import type { ReactNode } from "react";
import { Link } from "react-router";
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function AttentionRow({
  to,
  icon,
  title,
  meta,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border-b border-border/60 px-2 py-2.5 last:border-b-0 transition-colors hover:bg-muted/40"
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
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-3 text-xs text-muted-foreground">{children}</p>
  );
}

export function DashboardAttentionList({
  failedRuns,
  draftRules,
  coverageGaps,
  loading,
}: DashboardAttentionListProps) {
  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-6 text-xs text-muted-foreground">
        할 일 불러오는 중…
      </div>
    );
  }

  const hasAny =
    failedRuns.length > 0 || draftRules.length > 0 || coverageGaps.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <SectionLabel>실패 실행</SectionLabel>
          {failedRuns.length > 0 ? (
            <Link
              to="/history"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              이력 전체
            </Link>
          ) : null}
        </div>
        <div className="rounded-md border border-border bg-card">
          {failedRuns.length === 0 ? (
            <EmptyHint>최근 기간에 실패한 실행이 없습니다.</EmptyHint>
          ) : (
            failedRuns.slice(0, 5).map((run) => (
              <AttentionRow
                key={run.id}
                to={`/execution-result/${run.id}`}
                icon={<AlertTriangle className="size-3.5 text-destructive" />}
                title={run.scenarioTitle}
                meta={`#${run.id} · ${run.summary} · ${run.occurredAt}`}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <SectionLabel>YAML 초안</SectionLabel>
          {draftRules.length > 0 ? (
            <Link
              to="/rules?status=draft"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              초안 목록
            </Link>
          ) : null}
        </div>
        <div className="rounded-md border border-border bg-card">
          {draftRules.length === 0 ? (
            <EmptyHint>대기 중인 YAML 초안이 없습니다.</EmptyHint>
          ) : (
            draftRules.slice(0, 5).map((item) => (
              <AttentionRow
                key={item.bundle_id}
                to="/rules?status=draft"
                icon={<FileWarning className="size-3.5 text-amber-600" />}
                title={item.service_name || item.service_code}
                meta={`${item.service_code} · v${item.bundle_version} · 규칙 ${item.rules}건`}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <SectionLabel>커버리지 공백</SectionLabel>
          {coverageGaps.length > 0 ? (
            <Link
              to="/data-pool"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              Data Pool
            </Link>
          ) : null}
        </div>
        <div className="rounded-md border border-border bg-card">
          {coverageGaps.length === 0 ? (
            <EmptyHint>happy/negative 공백 서비스가 없습니다.</EmptyHint>
          ) : (
            coverageGaps.slice(0, 5).map((gap) => {
              const missing: string[] = [];
              if (gap.happy === 0) missing.push("happy");
              if (gap.negative === 0) missing.push("negative");
              return (
                <AttentionRow
                  key={gap.service_code}
                  to="/data-pool"
                  icon={<Layers className="size-3.5" />}
                  title={gap.service_code}
                  meta={`${missing.join(" · ")} 샘플 없음 (H ${gap.happy} / N ${gap.negative})`}
                />
              );
            })
          )}
        </div>
      </div>

      {!hasAny ? (
        <p className="text-xs text-muted-foreground">
          지금 처리할 이상 징후가 없습니다.
        </p>
      ) : null}
    </div>
  );
}
