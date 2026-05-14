import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookMarked,
  Download,
  FileCode2,
  GitPullRequest,
  Layers,
  Loader2,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
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
  FinixUnderlineTextarea,
} from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";
import { listServiceCatalog } from "@/api/serviceCatalogApi";
import { generateServiceRulesDraftFromSource } from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";
import { useAuthStore } from "../auth/authStore";

type RuleRegistryItem = {
  serviceCode: string;
  serviceName: string;
  sourceVersion: string;
  status: "active" | "draft";
  rules: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
};

type SortKey =
  | "code_asc"
  | "name_asc"
  | "updated_desc"
  | "rules_desc";

const MOCK_REGISTRY: RuleRegistryItem[] = [
  {
    serviceCode: "PY016",
    serviceName: "Request bank salary payment",
    sourceVersion: "cbs-release-2026.05.07",
    status: "draft",
    rules: 7,
    lastUpdatedAt: "2026-05-07 12:40",
    lastUpdatedBy: "qa.editor",
  },
  {
    serviceCode: "AC011",
    serviceName: "계좌해지",
    sourceVersion: "cbs-release-2026.05.07",
    status: "active",
    rules: 3,
    lastUpdatedAt: "2026-05-07 11:10",
    lastUpdatedBy: "qa.approver",
  },
  {
    serviceCode: "CU018",
    serviceName: "고객사망등록",
    sourceVersion: "cbs-release-2026.05.07",
    status: "active",
    rules: 2,
    lastUpdatedAt: "2026-05-07 10:55",
    lastUpdatedBy: "qa.approver",
  },
  {
    serviceCode: "CM060",
    serviceName: "정기예금 가입",
    sourceVersion: "cbs-release-2026.05.06",
    status: "active",
    rules: 4,
    lastUpdatedAt: "2026-05-06 09:12",
    lastUpdatedBy: "qa.editor",
  },
  {
    serviceCode: "PY027",
    serviceName: "수수료 결제 처리",
    sourceVersion: "cbs-release-2026.05.06",
    status: "draft",
    rules: 1,
    lastUpdatedAt: "2026-05-05 16:03",
    lastUpdatedBy: "qa.editor",
  },
];

const MOCK_YAML_BY_SERVICE: Record<string, string> = {
  PY016: `service_code: "PY016"
service_name: "Request bank salary payment"
source_version: "cbs-release-2026.05.07"
rules:
  - rule_id: "PY016-NEG-001"
    description: "pymntDt is mandatory"
    when: { input: { pymntDt: null } }
    expect:
      outcome: "error"
      http_status: 400
      error_code: "AAPCME0006"
      error_args: ["@pymntDt"]
    minimal_input:
      pymntDt: null
      pymntRmkCntnt: "급여이체"
      bsicAtchmntFileId: "file_basic_001"
      dtlAtchmntFileId: "file_detail_001"

  - rule_id: "PY016-NEG-010"
    description: "pymntDt must be larger than txDate"
    when:
      preconditions: { txDate: "runtime(ServiceContext.getTxDate)" }
      input: { pymntDt: "<= txDate" }
    expect: { outcome: "error", http_status: 400, error_code: "AAPCME0007" }
`,
  AC011: `service_code: "AC011"
service_name: "계좌해지"
source_version: "cbs-release-2026.05.07"
rules:
  - rule_id: "AC011-POS-001"
    description: "정상 계좌는 해지가 성공한다"
    when:
      preconditions: { customer_status: ["ALIVE"], account_status: ["ACTIVE"] }
      input: { close_reason: ["USER_REQUEST"] }
    expect: { outcome: "success", http_status: 200 }
`,
  CU018: `service_code: "CU018"
service_name: "고객사망등록"
source_version: "cbs-release-2026.05.07"
rules:
  - rule_id: "CU018-POS-001"
    description: "고객 사망 등록 성공"
    when: { input: { customer_id: "NOT_EMPTY" } }
    expect: { outcome: "success", http_status: 200 }
`,
  CM060: `service_code: "CM060"
service_name: "정기예금 가입"
source_version: "cbs-release-2026.05.06"
rules:
  - rule_id: "CM060-POS-001"
    description: "정상 고객의 예금 가입"
    when: { preconditions: { kyc_status: ["VERIFIED"] } }
    expect: { outcome: "success", http_status: 200 }
`,
  PY027: `service_code: "PY027"
service_name: "수수료 결제 처리"
source_version: "cbs-release-2026.05.06"
rules:
  - rule_id: "PY027-DRAFT-001"
    description: "초안 — 수수료 금액 검증"
    when: { input: { fee_amount: ">= 0" } }
    expect: { outcome: "success", http_status: 200 }
`,
};

function StatusPill({ status }: { status: RuleRegistryItem["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
        <BadgeCheck className="w-3 h-3" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-primary/12 text-primary border border-primary/25">
      <GitPullRequest className="w-3 h-3" />
      Draft
    </span>
  );
}

function compareUpdated(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function RulesMeta() {
  const { user } = useAuthStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RuleRegistryItem | null>(null);
  const [activeTab, setActiveTab] = useState<"meta" | "yaml">("meta");
  const [yamlText, setYamlText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "draft">("");
  const [versionFilter, setVersionFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [yamlAiOpen, setYamlAiOpen] = useState(false);
  const [yamlAiCatalog, setYamlAiCatalog] = useState<
    { code: string; name: string }[]
  >([]);
  const [yamlAiCatalogLoading, setYamlAiCatalogLoading] = useState(false);
  const [yamlAiService, setYamlAiService] = useState("");
  const [yamlAiSourceVersion, setYamlAiSourceVersion] = useState("source-scan");
  const [yamlAiSource, setYamlAiSource] = useState("");
  const [yamlAiHints, setYamlAiHints] = useState("");
  const [yamlAiSubmitting, setYamlAiSubmitting] = useState(false);
  const [yamlAiError, setYamlAiError] = useState<string | null>(null);
  const [yamlAiResult, setYamlAiResult] = useState<ServiceRuleBundleReadDto | null>(
    null,
  );

  useEffect(() => {
    if (!yamlAiOpen) return;
    let cancelled = false;
    (async () => {
      setYamlAiCatalogLoading(true);
      setYamlAiError(null);
      try {
        const rows = await listServiceCatalog();
        if (cancelled) return;
        const mapped = rows
          .map((r) => ({
            code: (r.service_code || "").trim(),
            name: (r.service_name || "").trim() || r.service_code,
          }))
          .filter((r) => r.code);
        mapped.sort((a, b) => a.code.localeCompare(b.code));
        setYamlAiCatalog(mapped);
        setYamlAiService((prev) =>
          prev && mapped.some((s) => s.code === prev)
            ? prev
            : mapped[0]?.code ?? "",
        );
      } catch (e) {
        if (!cancelled) {
          setYamlAiCatalog([]);
          setYamlAiError(
            e instanceof ApiError
              ? e.message
              : "서비스 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setYamlAiCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yamlAiOpen]);

  const uniqueVersions = useMemo(() => {
    const s = new Set(MOCK_REGISTRY.map((r) => r.sourceVersion));
    return [...s].sort();
  }, []);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = MOCK_REGISTRY.filter((x) => {
      if (statusFilter && x.status !== statusFilter) return false;
      if (versionFilter && x.sourceVersion !== versionFilter) return false;
      if (!q) return true;
      return (
        x.serviceCode.toLowerCase().includes(q) ||
        x.serviceName.toLowerCase().includes(q) ||
        x.sourceVersion.toLowerCase().includes(q) ||
        x.lastUpdatedBy.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "code_asc":
          return a.serviceCode.localeCompare(b.serviceCode, "en");
        case "name_asc":
          return a.serviceName.localeCompare(b.serviceName, "ko");
        case "updated_desc":
          return compareUpdated(b.lastUpdatedAt, a.lastUpdatedAt);
        case "rules_desc":
          return b.rules - a.rules || a.serviceCode.localeCompare(b.serviceCode);
        default:
          return 0;
      }
    });
    return list;
  }, [query, statusFilter, versionFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredSorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const pagesToShow = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= Math.min(totalPages, 5); i += 1) out.push(i);
    return out;
  }, [totalPages]);

  const openItem = (item: RuleRegistryItem) => {
    setSelected(item);
    setActiveTab("meta");
    setYamlText(MOCK_YAML_BY_SERVICE[item.serviceCode] ?? "");
    setLastSavedAt(null);
  };

  const closePanel = () => {
    setSelected(null);
    setYamlText("");
    setLastSavedAt(null);
  };

  const exportYaml = () => {
    if (!selected) return;
    const blob = new Blob([yamlText], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.serviceCode}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveDraft = () => {
    const now = new Date();
    setLastSavedAt(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
        now.getHours(),
      ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
  };

  const submitYamlFromSource = async () => {
    const code = yamlAiService.trim();
    const src = yamlAiSource.trim();
    if (!code) {
      setYamlAiError("서비스를 선택하세요.");
      return;
    }
    if (src.length < 16) {
      setYamlAiError("소스 코드는 최소 16자 이상 붙여넣어 주세요.");
      return;
    }
    setYamlAiSubmitting(true);
    setYamlAiError(null);
    setYamlAiResult(null);
    try {
      const bundle = await generateServiceRulesDraftFromSource(code, {
        source_code: yamlAiSource,
        source_version: yamlAiSourceVersion.trim() || null,
        hints: yamlAiHints.trim() || null,
        created_by: user?.username ?? null,
      });
      setYamlAiResult(bundle);
    } catch (e) {
      setYamlAiError(
        e instanceof ApiError ? e.message : "등록에 실패했습니다.",
      );
    } finally {
      setYamlAiSubmitting(false);
    }
  };

  const closeYamlAi = (open: boolean) => {
    if (open) return;
    setYamlAiOpen(false);
    setYamlAiError(null);
    setYamlAiResult(null);
    setYamlAiSource("");
    setYamlAiHints("");
  };

  return (
    <PageShell
      icon={<Layers className="w-5 h-5" strokeWidth={2} />}
      title="규칙 / 메타 관리"
      description="서비스 단위 레지스트리에서 YAML을 검토·편집하고 내보냅니다. 연동 전 샘플 데이터입니다."
    >

        <div className="rounded-md border border-primary/25 bg-primary/[0.06] px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="mt-0.5 rounded-sm bg-primary/15 p-2 text-primary shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                YAML 등록 (소스 기반 AI)
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                검증·업무·기술 규칙을 담은 백엔드 소스를 붙여넣으면, 시스템에 정의된
                YAML 템플릿에 맞춰 규칙 초안을 생성하고{" "}
                <span className="font-medium text-foreground">DB 드래프트</span>
                로 등록합니다. (error / business / code 규칙 유형을 모두 포함해야
                저장됩니다.)
              </p>
            </div>
          </div>
          <FinixPrimaryButton
            type="button"
            className="h-10 px-4 shrink-0 w-full sm:w-auto"
            onClick={() => {
              setYamlAiOpen(true);
              setYamlAiResult(null);
              setYamlAiError(null);
            }}
          >
            <Sparkles className="w-4 h-4" />
            소스 붙여넣기
          </FinixPrimaryButton>
        </div>

        <div className="rounded-md border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
          <BookMarked className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">
            카탈로그 스냅샷
          </span>
          <span className="text-xs text-muted-foreground">
            {uniqueVersions[uniqueVersions.length - 1]} 기준 레지스트리 · 활성{" "}
            {MOCK_REGISTRY.filter((x) => x.status === "active").length}건 ·
            초안{" "}
            {MOCK_REGISTRY.filter((x) => x.status === "draft").length}건
          </span>
        </div>

        <div className="bg-muted/40 border border-border rounded-md p-4 flex flex-wrap items-end gap-6">
          <div className="flex flex-wrap items-end gap-6">
            <FinixField label="정렬" className="min-w-[12rem]">
              <FinixUnderlineSelect
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as SortKey);
                  setPage(1);
                }}
              >
                <option value="updated_desc">수정일 · 최신순</option>
                <option value="code_asc">서비스 코드 · A→Z</option>
                <option value="name_asc">서비스명 · 가나다</option>
                <option value="rules_desc">규칙 수 · 많은순</option>
              </FinixUnderlineSelect>
            </FinixField>

            <FinixField label="상태" className="min-w-[8rem]">
              <FinixUnderlineSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
              >
                <option value="">전체</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </FinixUnderlineSelect>
            </FinixField>

            <FinixField label="소스 버전" className="min-w-[12rem]">
              <FinixUnderlineSelect
                value={versionFilter}
                onChange={(e) => {
                  setVersionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">전체</option>
                {uniqueVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
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
            목록 적용
          </FinixPrimaryButton>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="서비스 코드, 이름, 버전, 수정자로 검색"
            className="w-full h-10 pl-10 pr-11 rounded-md border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="button"
            aria-label="검색 초기화"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-sm hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setQuery("")}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  코드
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[180px]">
                  서비스명
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">
                  상태
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">
                  규칙
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[160px]">
                  소스 버전
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  수정
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[100px]">
                  수정자
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground w-[100px] text-right">
                  작업
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground text-sm"
                  >
                    조건에 맞는 레지스트리 항목이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((item) => (
                  <TableRow key={item.serviceCode} className="border-b border-border">
                    <TableCell className="py-3 font-mono text-sm font-medium">
                      {item.serviceCode}
                    </TableCell>
                    <TableCell className="py-3 text-sm">{item.serviceName}</TableCell>
                    <TableCell className="py-3">
                      <StatusPill status={item.status} />
                    </TableCell>
                    <TableCell className="py-3 text-right tabular-nums text-sm">
                      {item.rules}
                    </TableCell>
                    <TableCell
                      className="py-3 text-xs text-muted-foreground font-mono truncate max-w-[200px]"
                      title={item.sourceVersion}
                    >
                      {item.sourceVersion}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {item.lastUpdatedAt}
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground font-mono">
                      {item.lastUpdatedBy}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted hover:border-primary/30 transition-colors"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        편집
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            표시 중 {filteredSorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            –
            {Math.min(currentPage * pageSize, filteredSorted.length)} /
            총 {filteredSorted.length}건
          </p>
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
        </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        <DialogContent className="w-full max-h-[92vh] overflow-hidden flex flex-col sm:max-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0 gap-y-0">
          {selected && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left space-y-2">
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <DialogTitle className="text-lg leading-snug font-semibold">
                    {selected.serviceName}
                  </DialogTitle>
                  <span className="font-mono text-sm text-muted-foreground">
                    {selected.serviceCode}
                  </span>
                  <StatusPill status={selected.status} />
                </div>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground text-left">
                  {selected.sourceVersion}
                  {lastSavedAt ? ` · 로컬 저장 ${lastSavedAt}` : ""}
                  <span className="block mt-1 text-[11px]">
                    Draft는 런타임 반영 전 단계입니다. YAML 검증 후 Export 또는
                    저장(드래프트)하세요.
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 pt-3 shrink-0">
                <div className="inline-flex rounded-sm border border-border bg-muted/30 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("meta")}
                    className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                      activeTab === "meta"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    메타 요약
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("yaml")}
                    className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                      activeTab === "yaml"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    YAML 편집
                  </button>
                </div>
              </div>

              <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
                {activeTab === "meta" ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        서비스 코드
                      </dt>
                      <dd className="font-mono font-medium">{selected.serviceCode}</dd>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        서비스명
                      </dt>
                      <dd>{selected.serviceName}</dd>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        소스 버전
                      </dt>
                      <dd className="font-mono text-xs break-all">
                        {selected.sourceVersion}
                      </dd>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        규칙 수
                      </dt>
                      <dd className="tabular-nums font-medium">{selected.rules}</dd>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        마지막 수정
                      </dt>
                      <dd className="text-muted-foreground">
                        {selected.lastUpdatedAt}
                      </dd>
                    </div>
                    <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        수정자
                      </dt>
                      <dd className="font-mono text-xs">{selected.lastUpdatedBy}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        서비스 단위 YAML. 포맷 오류는 배포 전에 스키마 검증으로
                        막는 것을 권장합니다.
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={saveDraft}
                          className="h-9 px-3 rounded-sm border border-border bg-background text-xs font-medium hover:bg-muted"
                        >
                          저장(드래프트)
                        </button>
                        <FinixPrimaryButton
                          onClick={exportYaml}
                          className="h-9 px-3 text-xs rounded-sm w-auto"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export
                        </FinixPrimaryButton>
                      </div>
                    </div>
                    <textarea
                      value={yamlText}
                      onChange={(e) => setYamlText(e.target.value)}
                      className="w-full min-h-[min(420px,45vh)] sm:min-h-[420px] bg-background border border-border rounded-md p-3 font-mono text-[12px] leading-relaxed outline-none focus:ring-2 focus:ring-primary/25"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 sm:justify-between gap-2">
                <p className="text-[11px] text-muted-foreground text-left w-full sm:w-auto order-2 sm:order-1">
                  Rule Editor(폼 편집)는 레지스트리 연동 후 확장 예정입니다.
                </p>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted order-1 sm:order-2"
                  onClick={closePanel}
                >
                  닫기
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={yamlAiOpen} onOpenChange={closeYamlAi}>
        <DialogContent className="w-full max-h-[92vh] overflow-hidden flex flex-col sm:max-w-[min(42rem,calc(100vw-2rem))] gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border text-left space-y-1">
            <DialogTitle className="text-lg font-semibold">
              YAML 등록 — 소스 기반 AI
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-left">
              카탈로그에 등록된 서비스를 선택한 뒤, 컨트롤러·서비스·검증기 등 관련
              소스를 붙여넣으세요. LLM이 템플릿 구조에 맞춘 YAML을 만든 뒤 서버에서
              검증하고 새 드래프트 번들로 저장합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            {yamlAiError ? (
              <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
                {yamlAiError}
              </div>
            ) : null}

            {yamlAiResult ? (
              <div className="rounded-sm border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800 text-sm px-3 py-3 space-y-1">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  드래프트가 등록되었습니다.
                </p>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90 font-mono">
                  bundle #{yamlAiResult.id} · 버전 v{yamlAiResult.version} ·{" "}
                  {yamlAiResult.service_code}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  이후 단계는 승인·활성화 API 또는 운영 절차에 따라 진행하세요.
                </p>
              </div>
            ) : null}

            <FinixField label="서비스" helperText="DB 서비스 카탈로그 기준">
              {yamlAiCatalogLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  목록 불러오는 중…
                </div>
              ) : (
                <FinixUnderlineSelect
                  value={yamlAiService}
                  onChange={(e) => setYamlAiService(e.target.value)}
                  disabled={yamlAiCatalog.length === 0}
                >
                  {yamlAiCatalog.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </FinixUnderlineSelect>
              )}
            </FinixField>

            <FinixField
              label="소스 라벨 (source_version)"
              helperText="번들에 기록되는 문자열 (브랜치명, 커밋, 티켓 등)"
            >
              <FinixUnderlineInput
                value={yamlAiSourceVersion}
                onChange={(e) => setYamlAiSourceVersion(e.target.value)}
                placeholder="source-scan"
              />
            </FinixField>

            <FinixField
              label="추가 힌트 (선택)"
              helperText="포커스할 클래스명, 엔드포인트, 에러코드 규칙 등"
            >
              <FinixUnderlineTextarea
                value={yamlAiHints}
                onChange={(e) => setYamlAiHints(e.target.value)}
                rows={2}
                className="min-h-[3rem]"
              />
            </FinixField>

            <FinixField
              label="소스 코드"
              helperText="최대 약 12만 자까지 전송됩니다. Java/Kotlin/Spring 등 백엔드 소스."
            >
              <FinixUnderlineTextarea
                value={yamlAiSource}
                onChange={(e) => setYamlAiSource(e.target.value)}
                rows={14}
                spellCheck={false}
                className="min-h-[220px] font-mono text-[12px]"
                placeholder="여기에 관련 소스를 붙여넣으세요…"
              />
            </FinixField>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 flex-row justify-end gap-2">
            <button
              type="button"
              className="h-10 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
              onClick={() => closeYamlAi(false)}
            >
              닫기
            </button>
            <FinixPrimaryButton
              type="button"
              className="h-10 px-4 w-auto gap-2"
              disabled={
                yamlAiSubmitting ||
                yamlAiCatalogLoading ||
                !yamlAiService ||
                yamlAiSource.trim().length < 16
              }
              onClick={() => void submitYamlFromSource()}
            >
              {yamlAiSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              생성 · DB 등록
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
