import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CircleCheck,
  CircleX,
  Clock,
  History as HistoryGlyph,
  LayoutList,
  Monitor,
  RotateCw,
  Search,
} from "lucide-react";
import { PageShell } from "./PageShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  FinixField,
  FinixUnderlineInput,
  FinixUnderlineSelect,
} from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";

type ExecutionStatus = "success" | "failed" | "running";

type HistoryItem = {
  id: number;
  scenarioId: number;
  scenarioTitle: string;
  /** Full timestamp display (ms optional) */
  occurredAt: string;
  traceId: string;
  spanId: string;
  durationMs: number;
  /** 서비스 코드 스타일 거래 ID */
  txSrvcCode: string;
  node: string;
  status: ExecutionStatus;
  summary: string;
};

const MOCK_HISTORY: HistoryItem[] = [
  {
    id: 101,
    scenarioId: 21,
    scenarioTitle: "고객 사망 후 상속계좌 처리",
    occurredAt: "2026-05-07 15:24:38.538",
    traceId: "7a2f8c1e9b3d4f5a8e2c1d0b6a5f4e3c2b1a0987654321",
    spanId: "a1b2c3d4e5f6",
    durationMs: 50,
    txSrvcCode: "CU018",
    node: "rbs",
    status: "success",
    summary: "사망 등록 → 상속 처리(2 steps) 정상 완료",
  },
  {
    id: 100,
    scenarioId: 20,
    scenarioTitle: "정기예금 만기 전 해지(실패) 후 대체 처리",
    occurredAt: "2026-05-07 14:12:03.127",
    traceId: "5c3d9f2a1e8b7c6d5a4f3e2d1c0b9a876543210fedcba",
    spanId: "f6e5d4c3b2a1",
    durationMs: 118,
    txSrvcCode: "AC011",
    node: "rbs",
    status: "failed",
    summary: "만기 전 해지 실패 → 대체 플로우 필요",
  },
  {
    id: 99,
    scenarioId: 18,
    scenarioTitle: "급여이체 요청 입력 검증",
    occurredAt: "2026-05-07 11:02:55.901",
    traceId: "9e8d7c6b5a4938271605f4e3d2c1b0a9876543210",
    spanId: "12ab34cd56ef",
    durationMs: 45,
    txSrvcCode: "PY016",
    node: "rbs",
    status: "running",
    summary: "필수 입력 검증 케이스 실행 중",
  },
  {
    id: 98,
    scenarioId: 17,
    scenarioTitle: "고객 신규 후 정기예금 가입",
    occurredAt: "2026-05-07 09:30:22.004",
    traceId: "1a2b3c4d5e6f708192a3b4c5d6e7f8090",
    spanId: "99aa88bb77cc",
    durationMs: 203,
    txSrvcCode: "CM060",
    node: "rbs",
    status: "success",
    summary: "고객 신규 및 예금 가입 플로우 완료",
  },
];

const TAB_LABELS = [
  { key: "scenario", label: "시나리오 실행 이력" },
  { key: "api", label: "API 로그" },
  { key: "business", label: "업무 로그" },
  { key: "error", label: "에러 로그" },
] as const;

function StatusBadge({ status }: { status: ExecutionStatus }) {
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
        정상
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[12px] font-medium whitespace-nowrap bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900">
      <CircleX className="w-3 h-3" />
      에러
    </span>
  );
}

/** 거래 유형 배지 예시 이미지의 R 원형 표시 간소 버전 */
function TxTypeBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-muted-foreground/30 text-[11px] font-semibold bg-muted text-muted-foreground"
      title="실행"
    >
      R
    </span>
  );
}

export function History() {
  const [tab, setTab] =
    useState<(typeof TAB_LABELS)[number]["key"]>("scenario");
  const [dateFrom, setDateFrom] = useState("2026-05-07");
  const [timeStart, setTimeStart] = useState("00:00");
  const [timeEnd, setTimeEnd] = useState("23:59");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return MOCK_HISTORY.filter((row) => {
      const inDateRange = row.occurredAt.startsWith(dateFrom);
      const matchesSearch =
        !q ||
        row.scenarioTitle.toLowerCase().includes(q) ||
        row.traceId.toLowerCase().includes(q) ||
        row.txSrvcCode.toLowerCase().includes(q) ||
        row.summary.toLowerCase().includes(q);
      return inDateRange && matchesSearch;
    });
  }, [dateFrom, searchText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const pagesToShow = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= Math.min(totalPages, 5); i += 1) out.push(i);
    return out;
  }, [totalPages]);

  return (
    <PageShell
      icon={<HistoryGlyph className="w-5 h-5" strokeWidth={2} />}
      title="테스트 이력 조회"
      description="DB 연동 전 샘플 데이터입니다. 발생 일시·Trace·거래 ID 등은 참고용 예시 레이아웃입니다."
    >

        {/* Tabs */}
        <nav className="border-b border-border">
          <div className="flex gap-8">
            {TAB_LABELS.map((t) => {
              const isActive = tab === t.key;
              const disabled = t.key !== "scenario";
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setTab(t.key)}
                  className={`pb-3 text-sm transition-colors relative -mb-px disabled:opacity-45 disabled:pointer-events-none ${
                    isActive
                      ? "font-semibold text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {disabled && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      준비
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Filter bar */}
        <div className="bg-muted/40 border border-border rounded-md p-4 flex flex-wrap items-end gap-6">
          <div className="flex flex-wrap items-end gap-6">
            <FinixField label="발생 일자" className="min-w-[10rem]">
              <FinixUnderlineInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </FinixField>

            <FinixField label="시간(시작)" className="min-w-[8rem]">
              <FinixUnderlineInput
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
            </FinixField>

            <FinixField label="시간(종료)" className="min-w-[8rem]">
              <FinixUnderlineInput
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
            </FinixField>

            <FinixField label="로그 유형" className="min-w-[12rem]">
              <FinixUnderlineSelect
                value={tab}
                onChange={(e) =>
                  setTab(e.target.value as (typeof TAB_LABELS)[number]["key"])
                }
                disabled
              >
                {TAB_LABELS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </FinixUnderlineSelect>
            </FinixField>
          </div>

          <FinixPrimaryButton
            onClick={() => setPage(1)}
            className="h-9 px-4 ml-auto w-auto"
          >
            <Search className="w-4 h-4" />
            조회
          </FinixPrimaryButton>
        </div>

        {/* Secondary search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <FinixUnderlineInput
            type="text"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1);
            }}
            placeholder="검색 (시나리오명, Trace ID, 서비스코드, 요약)"
            className="h-10 pl-10 pr-11 bg-card"
          />
          <button
            type="button"
            aria-label="새로고침"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-sm hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setSearchText("")}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-xs font-semibold text-muted-foreground w-[88px]">
                  상태
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[180px]">
                  발생 일시
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[200px] max-w-[220px]">
                  Trace ID
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  Span ID
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  소요(ms)
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  거래 ID
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  노드
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  거래 유형
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  시나리오 요약
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[120px]">
                  작업
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    검색 결과가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((item) => (
                  <TableRow key={item.id} className="border-b border-border">
                    <TableCell className="py-3">
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-foreground whitespace-nowrap">
                      {item.occurredAt}
                    </TableCell>
                    <TableCell
                      className="font-mono text-[11px] text-muted-foreground max-w-[220px] truncate"
                      title={item.traceId}
                    >
                      {item.traceId}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {item.spanId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.durationMs}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {item.txSrvcCode}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.node}
                    </TableCell>
                    <TableCell>
                      <TxTypeBadge />
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-muted-foreground text-xs"
                      title={item.summary}
                    >
                      {item.summary}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/execution-result/${item.id}`}
                          title="실행 결과"
                          className="p-2 rounded-sm hover:bg-muted text-muted-foreground hover:text-primary transition-colors border border-transparent hover:border-border"
                        >
                          <Monitor className="w-4 h-4" />
                        </Link>
                        <span className="p-2 rounded-sm text-muted-foreground/40 border border-transparent cursor-default" title="로그 원문(예정)">
                          <LayoutList className="w-4 h-4" />
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>페이지 크기</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-9 rounded-sm border border-border bg-card px-2 text-sm"
            >
              <option value={5}>5개씩</option>
              <option value={10}>10개씩</option>
              <option value={20}>20개씩</option>
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-9 w-9 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-40"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
            >
              «
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-40"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            {pagesToShow.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`h-9 min-w-[2.25rem] rounded-full text-sm font-medium transition-colors ${
                  currentPage === p
                      ? "bg-[#5b8cff] text-white"
                    : "border border-transparent hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="h-9 w-9 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-40"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
            <button
              type="button"
              className="h-9 w-9 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-40"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              »
            </button>
          </div>
        </div>

        {/* 시나리오 링크 힌트 */}
        <p className="text-xs text-muted-foreground text-center pb-6">
          시나리오 #{MOCK_HISTORY[0]?.scenarioId} 등 연결 상세는 &quot;Monitor&quot;
          아이콘 또는 실행 결과 화면에서 확인할 수 있습니다.
        </p>
    </PageShell>
  );
}
