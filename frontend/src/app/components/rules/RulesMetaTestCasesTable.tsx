import type { TestCaseReadDto } from "@/api/types";
import { downloadPostmanCollection } from "@/api/testcaseApi";
import {
  inferPathKindFromTestCase,
  parseMaterializedTestCaseName,
} from "@/lib/materializedTestCaseMeta";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Play,
} from "lucide-react";
import { Fragment } from "react";
import { TestCaseIoPreview } from "../TestCaseIoPreview";
import {
  FinixDataTable,
  FinixDataTableBody,
  FinixDataTableCell,
  FinixDataTableFrame,
  FinixDataTableHead,
  FinixDataTableHeader,
  FinixDataTableRow,
  FINIX_DATA_TABLE_GHOST_BTN_CLASS,
  FINIX_DATA_TABLE_HUG_CLASS,
  FINIX_DATA_TABLE_STACK_CLASS,
} from "../ui/finix-data-table";
import { FinixLoading } from "../ui/finix-loading";
import { FinixStatusBadge } from "../ui/finix-status-badge";
import { CaseTypeBadge } from "./yamlCaseListUi";

const COL_COUNT = 9;

type RulesMetaTestCasesTableProps = {
  rows: TestCaseReadDto[];
  listLoading: boolean;
  emptyMessage: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  runningId?: string | null;
  onRun: (test: TestCaseReadDto) => void;
};

export function RulesMetaTestCasesTable({
  rows,
  listLoading,
  emptyMessage,
  expandedId,
  onToggleExpand,
  runningId = null,
  onRun,
}: RulesMetaTestCasesTableProps) {
  return (
    <div className={FINIX_DATA_TABLE_STACK_CLASS}>
      <div className={FINIX_DATA_TABLE_HUG_CLASS}>
        <FinixDataTableFrame className="flex-1">
          <FinixDataTable>
            <FinixDataTableHeader>
              <FinixDataTableRow className="hover:bg-transparent">
                <FinixDataTableHead className="w-10" aria-label="상세" />
                <FinixDataTableHead className="w-12">유형</FinixDataTableHead>
                <FinixDataTableHead className="w-[120px]">
                  case_id
                </FinixDataTableHead>
                <FinixDataTableHead className="min-w-[180px]">
                  이름
                </FinixDataTableHead>
                <FinixDataTableHead className="w-[64px]">버전</FinixDataTableHead>
                <FinixDataTableHead className="w-[72px]">상태</FinixDataTableHead>
                <FinixDataTableHead className="w-[88px]">
                  메서드
                </FinixDataTableHead>
                <FinixDataTableHead className="min-w-[140px]">
                  엔드포인트
                </FinixDataTableHead>
                <FinixDataTableHead className="w-[120px] text-right">
                  동작
                </FinixDataTableHead>
              </FinixDataTableRow>
            </FinixDataTableHeader>
            <FinixDataTableBody>
              {listLoading ? (
                <FinixDataTableRow>
                  <FinixDataTableCell
                    colSpan={COL_COUNT}
                    className="py-12 text-center text-muted-foreground text-sm"
                  >
                    <FinixLoading
                      size="md"
                      label="불러오는 중…"
                      inline
                      className="justify-center"
                    />
                  </FinixDataTableCell>
                </FinixDataTableRow>
              ) : rows.length === 0 ? (
                <FinixDataTableRow>
                  <FinixDataTableCell
                    colSpan={COL_COUNT}
                    className="py-12 text-center text-muted-foreground text-sm leading-relaxed"
                  >
                    {emptyMessage}
                  </FinixDataTableCell>
                </FinixDataTableRow>
              ) : (
                rows.map((r) => (
                  <TestCaseRow
                    key={r.rule_case_id}
                    test={r}
                    open={expandedId === r.rule_case_id}
                    running={runningId === r.rule_case_id}
                    onToggle={() => onToggleExpand(r.rule_case_id)}
                    onRun={() => onRun(r)}
                  />
                ))
              )}
            </FinixDataTableBody>
          </FinixDataTable>
        </FinixDataTableFrame>
      </div>
    </div>
  );
}

function TestCaseRow({
  test,
  open,
  running,
  onToggle,
  onRun,
}: {
  test: TestCaseReadDto;
  open: boolean;
  running: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const meta = parseMaterializedTestCaseName(test.name);
  const pathKind = inferPathKindFromTestCase(test);
  const statusOk =
    test.expected_status != null && test.expected_status < 300;

  return (
    <Fragment>
      <FinixDataTableRow interactive onClick={onToggle}>
        <FinixDataTableCell className="w-10">
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </FinixDataTableCell>
        <FinixDataTableCell>
          {pathKind ? (
            <CaseTypeBadge ruleType={pathKind} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </FinixDataTableCell>
        <FinixDataTableCell className="font-mono text-xs truncate max-w-[120px]">
          {meta.caseId ?? "—"}
        </FinixDataTableCell>
        <FinixDataTableCell className="max-w-[240px]">
          <span className="line-clamp-2 text-sm">
            {meta.shortLabel || test.name}
          </span>
        </FinixDataTableCell>
        <FinixDataTableCell className="font-mono text-xs tabular-nums">
          {test.tc_hist_version != null && test.tc_hist_version > 0
            ? `v${test.tc_hist_version}`
            : "—"}
        </FinixDataTableCell>
        <FinixDataTableCell>
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
        </FinixDataTableCell>
        <FinixDataTableCell className="font-mono text-xs">
          {test.method ?? "—"}
        </FinixDataTableCell>
        <FinixDataTableCell className="font-mono text-xs max-w-[180px] truncate">
          {test.endpoint ?? "—"}
        </FinixDataTableCell>
        <FinixDataTableCell
          className="text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex items-center justify-end gap-0.5">
            <button
              type="button"
              className={FINIX_DATA_TABLE_GHOST_BTN_CLASS}
              title="실행"
              aria-label="테스트케이스 실행"
              disabled={running}
              onClick={onRun}
            >
              {running ? (
                <FinixLoading size="sm" inline />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              className={FINIX_DATA_TABLE_GHOST_BTN_CLASS}
              title="Postman 내보내기"
              aria-label="Postman 내보내기"
              onClick={() =>
                void downloadPostmanCollection(
                  test.svc_code,
                  test.rule_case_id,
                )
              }
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </FinixDataTableCell>
      </FinixDataTableRow>
      {open ? (
        <FinixDataTableRow className="hover:bg-transparent">
          <FinixDataTableCell colSpan={COL_COUNT} className="p-0">
            <TestCaseIoPreview test={test} />
          </FinixDataTableCell>
        </FinixDataTableRow>
      ) : null}
    </Fragment>
  );
}
