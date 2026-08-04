import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Monitor } from "lucide-react";
import type {
  ExecutionHistoryRow,
  ExecutionHistoryStatus,
} from "@/lib/executionHistoryView";
import {
  FinixDataTable,
  FinixDataTableBody,
  FinixDataTableCell,
  FinixDataTableFrame,
  FinixDataTableHead,
  FinixDataTableHeader,
  FinixDataTableRow,
  FINIX_DATA_TABLE_GHOST_BTN_CLASS,
} from "../ui/finix-data-table";
import {
  FinixStatusBadge,
  executionStatusBadge,
} from "../ui/finix-status-badge";

function StatusPill({ status }: { status: ExecutionHistoryStatus }) {
  const { tone, label } = executionStatusBadge(status);
  return <FinixStatusBadge tone={tone}>{label}</FinixStatusBadge>;
}

type Props = {
  rows: ExecutionHistoryRow[];
  emptyMessage?: string;
  emptySlot?: ReactNode;
};

export function ExecutionHistoryTable({
  rows,
  emptyMessage = "조회 결과가 없습니다.",
  emptySlot,
}: Props) {
  const navigate = useNavigate();

  const openResult = (id: number) => {
    navigate(`/execution-result/${id}`, { state: { from: "/history" } });
  };

  return (
    <FinixDataTableFrame>
      <FinixDataTable>
        <FinixDataTableHeader>
          <FinixDataTableRow className="hover:bg-transparent">
            <FinixDataTableHead className="w-[72px]">상태</FinixDataTableHead>
            <FinixDataTableHead className="w-[72px]">실행 ID</FinixDataTableHead>
            <FinixDataTableHead className="min-w-[160px]">발생 일시</FinixDataTableHead>
            <FinixDataTableHead className="min-w-[180px]">시나리오</FinixDataTableHead>
            <FinixDataTableHead className="w-[100px]">모드</FinixDataTableHead>
            <FinixDataTableHead className="min-w-[140px]">Base URL</FinixDataTableHead>
            <FinixDataTableHead className="w-[88px] text-right">
              성공/실패
            </FinixDataTableHead>
            <FinixDataTableHead className="min-w-[140px]">요약</FinixDataTableHead>
            <FinixDataTableHead className="w-[56px] text-right">결과</FinixDataTableHead>
          </FinixDataTableRow>
        </FinixDataTableHeader>
        <FinixDataTableBody>
          {rows.length === 0 ? (
            <FinixDataTableRow>
              <FinixDataTableCell colSpan={9} className="py-8">
                {emptySlot ?? (
                  <p className="text-center text-muted-foreground text-sm">
                    {emptyMessage}
                  </p>
                )}
              </FinixDataTableCell>
            </FinixDataTableRow>
          ) : (
            rows.map((item) => (
              <FinixDataTableRow
                key={item.id}
                interactive
                onClick={() => openResult(item.id)}
              >
                <FinixDataTableCell>
                  <StatusPill status={item.status} />
                </FinixDataTableCell>
                <FinixDataTableCell className="font-mono text-sm tabular-nums">
                  #{item.id}
                </FinixDataTableCell>
                <FinixDataTableCell className="font-mono text-[12px] whitespace-nowrap">
                  {item.occurredAt}
                </FinixDataTableCell>
                <FinixDataTableCell
                  className="text-sm max-w-[220px] truncate"
                  title={item.scenarioTitle}
                >
                  {item.scenarioTitle}
                </FinixDataTableCell>
                <FinixDataTableCell className="text-xs text-muted-foreground">
                  {item.modeLabel}
                </FinixDataTableCell>
                <FinixDataTableCell
                  className="font-mono text-[11px] text-muted-foreground max-w-[180px] truncate"
                  title={item.baseUrl}
                >
                  {item.baseUrl}
                </FinixDataTableCell>
                <FinixDataTableCell className="text-right tabular-nums text-sm">
                  <span className="text-success">{item.passed}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={item.failed > 0 ? "text-destructive" : ""}>
                    {item.failed}
                  </span>
                </FinixDataTableCell>
                <FinixDataTableCell
                  className="max-w-[200px] truncate text-muted-foreground text-xs"
                  title={item.summary}
                >
                  {item.summary}
                </FinixDataTableCell>
                <FinixDataTableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    to={`/execution-result/${item.id}`}
                    state={{ from: "/history" }}
                    title="실행 결과"
                    className={FINIX_DATA_TABLE_GHOST_BTN_CLASS}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </Link>
                </FinixDataTableCell>
              </FinixDataTableRow>
            ))
          )}
        </FinixDataTableBody>
      </FinixDataTable>
    </FinixDataTableFrame>
  );
}
