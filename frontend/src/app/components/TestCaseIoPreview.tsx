import type { ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import type { TestCaseReadDto } from "@/api/types";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "./ui/table";
import { cn } from "./ui/utils";

interface TestCaseIoPreviewProps {
  test: TestCaseReadDto;
}

function DetailTableRow({
  label,
  value,
  mono = false,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-[120px] sm:w-[140px] text-xs text-muted-foreground bg-muted/30 align-top py-2.5">
        {label}
      </TableCell>
      <TableCell
        className={cn(
          "text-sm align-top py-2.5 break-words",
          mono && "font-mono text-xs",
          valueClassName,
        )}
      >
        {value ?? "—"}
      </TableCell>
    </TableRow>
  );
}

const PAYLOAD_BOX_CLASS =
  "bg-card border border-border rounded-sm p-3 text-xs min-h-48 flex-1 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

function PayloadPanel({
  title,
  headerExtra,
  json,
}: {
  title: string;
  headerExtra?: ReactNode;
  json: Record<string, unknown>;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 h-full min-h-48">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0 min-h-6">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
        {headerExtra}
      </div>
      <pre className={PAYLOAD_BOX_CLASS}>
        <code className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {JSON.stringify(json ?? {}, null, 2)}
        </code>
      </pre>
    </div>
  );
}

/** Expanded test case detail: metadata table + request/expected payloads. */
export function TestCaseIoPreview({ test }: TestCaseIoPreviewProps) {
  const status = test.expected_status ?? null;
  const statusOk = status != null && status < 300;

  return (
    <div className="p-4 bg-muted/30 border-t border-border text-left space-y-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">상세 정보</h4>
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Table>
            <TableBody>
              <DetailTableRow label="ID" value={test.id} mono />
              <DetailTableRow label="이름" value={test.name} />
              <DetailTableRow
                label="시나리오"
                value={
                  test.scenario_id != null ? (
                    <Link
                      to={`/test-case/${test.scenario_id}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      #{test.scenario_id}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </Link>
                  ) : (
                    "—"
                  )
                }
                mono
              />
              <DetailTableRow label="메서드" value={test.method} mono />
              <DetailTableRow
                label="엔드포인트"
                value={test.endpoint}
                mono
                valueClassName="break-all"
              />
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 md:items-stretch">
        <PayloadPanel
          title="요청 (request_body)"
          json={test.request_body ?? {}}
        />
        <PayloadPanel
          title="예상 응답 (expected)"
          headerExtra={
            <>
              <span className="text-xs text-muted-foreground">· HTTP 상태</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-xs",
                  statusOk
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {status ?? "—"}
              </span>
            </>
          }
          json={test.expected_body ?? {}}
        />
      </section>
    </div>
  );
}
