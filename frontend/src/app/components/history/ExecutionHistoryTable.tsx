import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { CircleCheck, CircleX, Clock, Monitor } from "lucide-react";
import type { ExecutionHistoryRow, ExecutionHistoryStatus } from "@/lib/executionHistoryView";
import { cn } from "../ui/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

function StatusBadge({ status }: { status: ExecutionHistoryStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[12px] font-medium whitespace-nowrap bg-primary/15 text-primary border border-primary/25">
        <Clock className="w-3 h-3" />
        진행
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[12px] font-medium whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
        <CircleCheck className="w-3 h-3" />
        성공
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[12px] font-medium whitespace-nowrap bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900">
      <CircleX className="w-3 h-3" />
      실패
    </span>
  );
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
    <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="text-xs font-semibold text-muted-foreground w-[88px]">
              상태
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground w-[72px]">
              실행 ID
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground min-w-[160px]">
              발생 일시
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground min-w-[180px]">
              시나리오
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground w-[100px]">
              모드
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground min-w-[140px]">
              Base URL
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground text-right w-[88px]">
              성공/실패
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground min-w-[140px]">
              요약
            </TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground w-[72px]">
              결과
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8">
                {emptySlot ?? (
                  <p className="text-center text-muted-foreground text-sm">
                    {emptyMessage}
                  </p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "border-b border-border cursor-pointer hover:bg-muted/40 transition-colors",
                  item.status === "failed" && "bg-destructive/[0.02]",
                )}
                onClick={() => openResult(item.id)}
              >
                <TableCell className="py-3">
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="font-mono text-sm tabular-nums">
                  #{item.id}
                </TableCell>
                <TableCell className="font-mono text-[12px] whitespace-nowrap">
                  {item.occurredAt}
                </TableCell>
                <TableCell
                  className="text-sm max-w-[220px] truncate"
                  title={item.scenarioTitle}
                >
                  {item.scenarioTitle}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.modeLabel}
                </TableCell>
                <TableCell
                  className="font-mono text-[11px] text-muted-foreground max-w-[180px] truncate"
                  title={item.baseUrl}
                >
                  {item.baseUrl}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  <span className="text-success">{item.passed}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={item.failed > 0 ? "text-destructive" : ""}>
                    {item.failed}
                  </span>
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate text-muted-foreground text-xs"
                  title={item.summary}
                >
                  {item.summary}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Link
                    to={`/execution-result/${item.id}`}
                    state={{ from: "/history" }}
                    title="실행 결과"
                    className="inline-flex p-2 rounded-sm hover:bg-muted text-muted-foreground hover:text-primary transition-colors border border-transparent hover:border-border"
                  >
                    <Monitor className="w-4 h-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
