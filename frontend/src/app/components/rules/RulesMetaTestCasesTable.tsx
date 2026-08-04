import type { TestCaseReadDto } from "@/api/types";
import { downloadPostmanCollection } from "@/api/testcaseApi";
import {
  inferPathKindFromTestCase,
  parseMaterializedTestCaseName,
} from "@/lib/materializedTestCaseMeta";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
} from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router";
import { TestCaseIoPreview } from "../TestCaseIoPreview";
import { FinixLoading } from "../ui/finix-loading";
import { FinixStatusBadge } from "../ui/finix-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { CaseTypeBadge } from "./yamlCaseListUi";

const ROW_ICON_BTN =
  "h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

const COL_COUNT = 9;

type RulesMetaTestCasesTableProps = {
  rows: TestCaseReadDto[];
  listLoading: boolean;
  emptyMessage: string;
  expandedId: number | null;
  onToggleExpand: (id: number) => void;
};

export function RulesMetaTestCasesTable({
  rows,
  listLoading,
  emptyMessage,
  expandedId,
  onToggleExpand,
}: RulesMetaTestCasesTableProps) {
  return (
    <div className="rounded-md border border-border overflow-hidden flex-1 min-h-0 flex flex-col">
      <div className="overflow-y-auto flex-1 min-h-0">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-10" aria-label="상세" />
              <TableHead className="w-12">유형</TableHead>
              <TableHead className="w-[72px]">ID</TableHead>
              <TableHead className="w-[120px]">case_id</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="w-[72px]">상태</TableHead>
              <TableHead className="w-[88px]">메서드</TableHead>
              <TableHead>엔드포인트</TableHead>
              <TableHead className="w-[120px] text-right">동작</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listLoading ? (
              <TableRow>
                <TableCell
                  colSpan={COL_COUNT}
                  className="text-center text-muted-foreground py-10"
                >
                  <FinixLoading
                    size="md"
                    label="불러오는 중…"
                    inline
                    className="justify-center"
                  />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COL_COUNT}
                  className="text-center text-muted-foreground py-10 px-6 text-sm leading-relaxed"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TestCaseRow
                  key={r.id}
                  test={r}
                  open={expandedId === r.id}
                  onToggle={() => onToggleExpand(r.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TestCaseRow({
  test,
  open,
  onToggle,
}: {
  test: TestCaseReadDto;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = parseMaterializedTestCaseName(test.name);
  const pathKind = inferPathKindFromTestCase(test);
  const statusOk =
    test.expected_status != null && test.expected_status < 300;

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={onToggle}
      >
        <TableCell className="w-10 p-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          {pathKind ? (
            <CaseTypeBadge ruleType={pathKind} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{test.id}</TableCell>
        <TableCell className="font-mono text-xs truncate max-w-[120px]">
          {meta.caseId ?? "—"}
        </TableCell>
        <TableCell className="max-w-[240px]">
          <span className="line-clamp-2 text-sm">
            {meta.shortLabel || test.name}
          </span>
        </TableCell>
        <TableCell>
          {test.expected_status == null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <FinixStatusBadge
              tone={statusOk ? "success" : "danger"}
              className="font-mono"
            >
              {test.expected_status}
            </FinixStatusBadge>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {test.method ?? "—"}
        </TableCell>
        <TableCell className="font-mono text-xs max-w-[180px] truncate">
          {test.endpoint ?? "—"}
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center justify-end gap-0.5">
            <button
              type="button"
              className={ROW_ICON_BTN}
              title="이름 복사"
              aria-label="이름 복사"
              onClick={() => void navigator.clipboard.writeText(test.name)}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={ROW_ICON_BTN}
              title="Postman 내보내기"
              aria-label="Postman 내보내기"
              onClick={() => void downloadPostmanCollection(test.id)}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {test.scenario_id != null ? (
              <Link
                to={`/test-case/${test.scenario_id}`}
                className={ROW_ICON_BTN}
                title="시나리오 테스트케이스 화면"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={COL_COUNT} className="p-0">
            <TestCaseIoPreview test={test} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}
