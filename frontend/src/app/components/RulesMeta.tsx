import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookMarked,
  Check,
  Copy,
  Download,
  FileCode2,
  GitPullRequest,
  Layers,
  CheckCircle2,
  RotateCw,
  Search,
  Sparkles,
  History,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
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
import { FinixLoading } from "./ui/finix-loading";
import { RulesMetaHistoryDialog } from "./rules/RulesMetaHistoryDialog";
import { RulesMetaHintButton } from "./rules/RulesMetaHintButton";
import { RulesMetaTestCasesPanel } from "./rules/RulesMetaTestCasesPanel";
import { YamlRulesEditPanel } from "./rules/YamlRulesEditPanel";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import {
  activateServiceRulesBundle,
  approveServiceRulesBundle,
  createServiceRulesDraft,
  generateServiceRulesDraftFromSource,
  getServiceRulesBundle,
  updateServiceRulesDraft,
} from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";
import { useProgressiveWaitMessage } from "@/hooks/useProgressiveWaitMessage";
import {
  mergeSelectedWithBundle,
  type RuleRegistryItem,
  useRulesRegistry,
} from "@/hooks/useRulesRegistry";
import {
  formatRegistryVersionSummary,
  registryStatusHint,
  registryVersionHint,
} from "@/lib/formatRegistryVersions";
import {
  getNewVersionDisabledReason,
  getSaveDraftDisabledReason,
} from "@/lib/saveDraftDisabledReason";
import { useAuthStore } from "../auth/authStore";
import { FINIX_LARGE_MODAL_CONTENT } from "@/lib/finixModalLayout";
import { cn } from "./ui/utils";

type SortKey =
  | "code_asc"
  | "name_asc"
  | "updated_desc"
  | "rules_desc";

function StatusPill({ status }: { status: string }) {
  const st = (status || "draft").toLowerCase();
  if (st === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
        <BadgeCheck className="w-3 h-3" />
        Active
      </span>
    );
  }
  if (st === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-muted text-muted-foreground border border-border">
        Approved
      </span>
    );
  }
  if (st === "superseded") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-muted/80 text-muted-foreground border border-border">
        Superseded
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
  const [activeTab, setActiveTab] = useState<"yaml" | "testcases" | "meta">(
    "yaml",
  );
  const [yamlText, setYamlText] = useState("");
  const [baselineYamlText, setBaselineYamlText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "draft" | "approved">("");
  const [versionFilter, setVersionFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [yamlCopyDone, setYamlCopyDone] = useState(false);
  const [yamlRuleFocusEdit, setYamlRuleFocusEdit] = useState(false);
  const [historyItem, setHistoryItem] = useState<RuleRegistryItem | null>(null);

  const {
    registry,
    loading: registryLoading,
    error: registryError,
    load: reloadRegistry,
    activeCount,
    draftCount,
  } = useRulesRegistry({ query, statusFilter });

  const [yamlAiOpen, setYamlAiOpen] = useState(false);
  const [yamlAiPickerKey, setYamlAiPickerKey] = useState(0);
  const {
    options: yamlAiCatalog,
    loading: yamlAiCatalogLoading,
    error: yamlAiCatalogError,
  } = useServiceCatalogPicker({ enabled: yamlAiOpen });
  const [yamlAiService, setYamlAiService] = useState("");
  const [yamlAiSourceVersion, setYamlAiSourceVersion] = useState("source-scan");
  const [yamlAiSource, setYamlAiSource] = useState("");
  const [yamlAiHints, setYamlAiHints] = useState("");
  const [yamlAiSubmitting, setYamlAiSubmitting] = useState(false);
  const yamlAiWaitMessage = useProgressiveWaitMessage(yamlAiSubmitting);
  const [yamlAiError, setYamlAiError] = useState<string | null>(null);
  const [yamlAiSuccessOpen, setYamlAiSuccessOpen] = useState(false);
  const [yamlAiSuccessBundle, setYamlAiSuccessBundle] =
    useState<ServiceRuleBundleReadDto | null>(null);

  const uniqueVersions = useMemo(() => {
    const s = new Set(
      registry.map((r) => r.sourceVersion).filter((v) => v && v !== "—"),
    );
    return [...s].sort();
  }, [registry]);

  const filteredSorted = useMemo(() => {
    let list = registry.filter((x) => {
      if (versionFilter && x.sourceVersion !== versionFilter) return false;
      return true;
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
  }, [registry, versionFilter, sortKey]);

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

  const historyRow = useMemo(() => {
    if (!historyItem) return null;
    return registry.find((r) => r.serviceCode === historyItem.serviceCode) ?? historyItem;
  }, [historyItem, registry]);

  const loadBundleYaml = async (serviceCode: string, bundleId: number) => {
    setEditLoading(true);
    setEditError(null);
    try {
      const bundle = await getServiceRulesBundle(serviceCode, bundleId);
      const nextYaml = bundle.yaml_text ?? "";
      setYamlText(nextYaml);
      setBaselineYamlText(nextYaml);
      const rulesArr =
        bundle.rules && Array.isArray((bundle.rules as { rules?: unknown }).rules)
          ? (bundle.rules as { rules: unknown[] }).rules
          : null;
      setSelected((prev) =>
        prev && prev.serviceCode === serviceCode
          ? {
              ...prev,
              bundleId: bundle.id,
              bundleVersion: bundle.version,
              status: bundle.status,
              rules: rulesArr?.length ?? prev.rules,
              sourceVersion: bundle.source_version ?? "—",
            }
          : prev,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "YAML을 불러오지 못했습니다.",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const resolveRegistryRow = (item: RuleRegistryItem) =>
    registry.find((r) => r.serviceCode === item.serviceCode) ?? item;

  const openEdit = async (item: RuleRegistryItem, bundleId?: number) => {
    const row = resolveRegistryRow(item);
    setSelected(row);
    setActiveTab("yaml");
    setYamlText("");
    setLastSavedAt(null);
    setEditError(null);
    setEditNotice(null);
    setYamlCopyDone(false);
    await loadBundleYaml(row.serviceCode, bundleId ?? row.bundleId);
  };

  const openHistory = (item: RuleRegistryItem) => {
    setHistoryItem(resolveRegistryRow(item));
  };

  const handleEditFromHistory = (bundleId: number) => {
    if (!historyItem) return;
    void openEdit(historyItem, bundleId);
  };

  const closePanel = () => {
    setSelected(null);
    setYamlText("");
    setBaselineYamlText("");
    setLastSavedAt(null);
    setEditError(null);
    setEditNotice(null);
    setActivateConfirmOpen(false);
    setCloseConfirmOpen(false);
    setYamlCopyDone(false);
    setYamlRuleFocusEdit(false);
  };

  const hasUnsavedChanges =
    !!selected && yamlText.trimEnd() !== baselineYamlText.trimEnd();

  const requestClosePanel = () => {
    if (editSaving) return;
    if (!selected) return;
    if (hasUnsavedChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    closePanel();
  };

  const copyYamlToClipboard = async () => {
    if (!yamlText.trim()) return;
    try {
      await navigator.clipboard.writeText(yamlText);
      setYamlCopyDone(true);
      window.setTimeout(() => setYamlCopyDone(false), 2000);
    } catch {
      setEditError("클립보드에 복사하지 못했습니다.");
    }
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

  const draftPayload = () => ({
    yaml_text: yamlText,
    source_version:
      selected && selected.sourceVersion !== "—" ? selected.sourceVersion : null,
    created_by: user?.username ?? null,
  });

  const applySavedBundle = (
    bundle: ServiceRuleBundleReadDto,
    notice: string,
    registryRows?: RuleRegistryItem[],
  ) => {
    const now = new Date();
    setLastSavedAt(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
        now.getHours(),
      ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    setSelected((prev) => {
      if (!prev) return prev;
      const row = registryRows?.find((r) => r.serviceCode === prev.serviceCode);
      return mergeSelectedWithBundle(prev, bundle, row);
    });
    if (registryRows?.length) {
      setHistoryItem((prev) => {
        if (!prev) return prev;
        const row = registryRows.find((r) => r.serviceCode === prev.serviceCode);
        return row ?? prev;
      });
    }
    setEditNotice(notice);
    setBaselineYamlText(yamlText);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!selected) return false;
    if ((selected.status || "").toLowerCase() !== "draft") {
      setEditError(
        "활성·승인 번들은 덮어쓸 수 없습니다. 「새 버전 만들기」를 사용하세요.",
      );
      return false;
    }
    setEditSaving(true);
    setEditError(null);
    setEditNotice(null);
    try {
      const bundle = await updateServiceRulesDraft(
        selected.serviceCode,
        selected.bundleId,
        draftPayload(),
      );
      const items = await reloadRegistry();
      applySavedBundle(
        bundle,
        `v${bundle.version}에 반영됨 (#${bundle.id})`,
        items,
      );
      return true;
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "저장에 실패했습니다.",
      );
      return false;
    } finally {
      setEditSaving(false);
    }
  };

  const saveNewVersion = async () => {
    if (!selected) return;
    setEditSaving(true);
    setEditError(null);
    setEditNotice(null);
    try {
      const bundle = await createServiceRulesDraft(
        selected.serviceCode,
        draftPayload(),
      );
      const items = await reloadRegistry();
      applySavedBundle(
        bundle,
        `스냅샷 v${bundle.version} 생성됨 (#${bundle.id})`,
        items,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "새 버전 만들기에 실패했습니다.",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const runApprove = async () => {
    if (!selected) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const bundle = await approveServiceRulesBundle(
        selected.serviceCode,
        selected.bundleId,
      );
      const items = await reloadRegistry();
      applySavedBundle(bundle, "승인되었습니다.", items);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "승인에 실패했습니다.");
    } finally {
      setEditSaving(false);
    }
  };

  const runActivate = async () => {
    if (!selected) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const bundle = await activateServiceRulesBundle(
        selected.serviceCode,
        selected.bundleId,
      );
      const items = await reloadRegistry();
      applySavedBundle(
        bundle,
        "활성화되었습니다. 테스트 케이스 생성에 사용됩니다.",
        items,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "활성화에 실패했습니다.",
      );
    } finally {
      setEditSaving(false);
    }
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
    try {
      const bundle = await generateServiceRulesDraftFromSource(code, {
        source_code: yamlAiSource,
        source_version: yamlAiSourceVersion.trim() || null,
        hints: yamlAiHints.trim() || null,
        created_by: user?.username ?? null,
      });
      await reloadRegistry();
      resetYamlAiForm();
      setYamlAiOpen(false);
      setYamlAiSuccessBundle(bundle);
      setYamlAiSuccessOpen(true);
    } catch (e) {
      setYamlAiError(
        e instanceof ApiError ? e.message : "YAML 등록에 실패했습니다.",
      );
    } finally {
      setYamlAiSubmitting(false);
    }
  };

  const resetYamlAiForm = () => {
    setYamlAiService("");
    setYamlAiError(null);
    setYamlAiSource("");
    setYamlAiHints("");
    setYamlAiSourceVersion("source-scan");
  };

  const closeYamlAi = (open: boolean) => {
    if (open) return;
    if (yamlAiSubmitting) return;
    setYamlAiOpen(false);
    resetYamlAiForm();
  };

  const closeYamlAiSuccess = (open: boolean) => {
    if (open) return;
    setYamlAiSuccessOpen(false);
    setYamlAiSuccessBundle(null);
  };

  return (
    <PageShell
      icon={<Layers className="w-5 h-5" strokeWidth={2} />}
      title="규칙 / 메타 관리"
      description="서비스별 규칙 번들(DB)을 조회·편집하고 드래프트 저장·승인·활성화합니다."
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
                로 등록합니다. (Error(E)와 Normal(N) 케이스를 포함해야 저장됩니다.)
              </p>
            </div>
          </div>
          <FinixPrimaryButton
            type="button"
            className="h-10 px-4 shrink-0 w-full sm:w-auto"
            onClick={() => {
              setYamlAiService("");
              setYamlAiPickerKey((k) => k + 1);
              setYamlAiOpen(true);
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
            DB 레지스트리 · 활성 {activeCount}건 · 초안 {draftCount}건
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
                <option value="approved">Approved</option>
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
            onClick={() => void reloadRegistry()}
            className="h-9 px-4 ml-auto w-auto"
          >
            <RotateCw className="w-4 h-4" />
            새로고침
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
                <TableHead className="text-xs font-semibold text-muted-foreground min-w-[140px]">
                  버전
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
                <TableHead className="text-xs font-semibold text-muted-foreground w-[200px] text-right">
                  작업
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registryLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-muted-foreground text-sm"
                  >
                    <FinixLoading size="md" label="불러오는 중…" inline className="justify-center" />
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-muted-foreground text-sm"
                  >
                    등록된 규칙 번들이 없습니다. 소스 AI로 드래프트를 만드세요.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((item) => (
                  <TableRow
                    key={`${item.serviceCode}:${item.bundleId}`}
                    className="border-b border-border"
                  >
                    <TableCell className="py-3 font-mono text-sm font-medium">
                      {item.serviceCode}
                    </TableCell>
                    <TableCell
                      className="py-3 text-xs text-muted-foreground font-mono"
                      title={
                        registryVersionHint(item) ??
                        `편집 대상 #${item.bundleId}`
                      }
                    >
                      {formatRegistryVersionSummary(item)}
                    </TableCell>
                    <TableCell className="py-3 text-sm">{item.serviceName}</TableCell>
                    <TableCell className="py-3" title={registryStatusHint(item)}>
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
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openEdit(item)}
                          title="YAML 편집"
                          aria-label={`${item.serviceCode} YAML 편집`}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:border-primary/30 hover:text-foreground transition-colors"
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openHistory(item)}
                          title={`버전 이력 (${item.versionCount})`}
                          aria-label={`${item.serviceCode} 버전 이력 ${item.versionCount}개`}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
          if (!open) requestClosePanel();
        }}
      >
        <DialogContent className={FINIX_LARGE_MODAL_CONTENT}>
          {selected && (
            <>
              <DialogHeader
                className={cn(
                  "px-6 border-b border-border shrink-0 text-left",
                  yamlRuleFocusEdit ? "pt-4 pb-3" : "pt-6 pb-4 space-y-2",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <DialogTitle
                    className={cn(
                      "leading-snug font-semibold",
                      yamlRuleFocusEdit ? "text-base" : "text-lg",
                    )}
                  >
                    {selected.serviceName}
                  </DialogTitle>
                  <span className="font-mono text-sm text-muted-foreground">
                    {selected.serviceCode}
                  </span>
                </div>
                {!yamlRuleFocusEdit ? (
                  <DialogDescription asChild>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline text-left"
                      onClick={() => openHistory(selected)}
                    >
                      버전 이력 ({selected.versionCount}) 보기
                    </button>
                  </DialogDescription>
                ) : null}
              </DialogHeader>

              {!yamlRuleFocusEdit ? (
              <div className="px-6 pt-3 shrink-0">
                <div className="inline-flex rounded-sm border border-border bg-muted/30 p-1">
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
                  <button
                    type="button"
                    onClick={() => setActiveTab("testcases")}
                    className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                      activeTab === "testcases"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    테스트케이스
                  </button>
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
                </div>
              </div>
              ) : null}

              <div
                className={cn(
                  "px-6 flex-1 min-h-0 overflow-x-hidden",
                  yamlRuleFocusEdit ? "py-2" : "py-4",
                  activeTab === "yaml"
                    ? "flex flex-col overflow-hidden"
                    : "flex flex-col overflow-y-auto min-h-0",
                )}
              >
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
                ) : activeTab === "testcases" ? (
                  <RulesMetaTestCasesPanel
                    serviceCode={selected.serviceCode}
                    serviceName={selected.serviceName}
                    active={activeTab === "testcases"}
                    disabled={editLoading}
                  />
                ) : (
                  <YamlRulesEditPanel
                    serviceCode={selected.serviceCode}
                    yamlText={yamlText}
                    onYamlChange={setYamlText}
                    disabled={editLoading}
                    yamlCopyDone={yamlCopyDone}
                    onCopy={() => void copyYamlToClipboard()}
                    onExport={exportYaml}
                    onNotice={setEditNotice}
                    onError={setEditError}
                    onFocusEditChange={setYamlRuleFocusEdit}
                  />
                )}
              </div>

              {!yamlRuleFocusEdit ? (
              <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-wrap justify-end gap-2">
                {editNotice ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 w-full text-left">{editNotice}</p>
                ) : null}
                {editError ? (
                  <p className="text-xs text-destructive w-full text-left">{editError}</p>
                ) : null}
                {(() => {
                  const saveDisabledReason = getSaveDraftDisabledReason(
                    editSaving,
                    editLoading,
                    selected.status,
                  );
                  const saveDisabled = saveDisabledReason != null;
                  return (
                    <>
                      <RulesMetaHintButton
                        hint={
                          saveDisabledReason ??
                          "현재 draft에 YAML을 덮어씁니다 (버전 번호는 유지)."
                        }
                      >
                        <button
                          type="button"
                          className="h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                          disabled={saveDisabled}
                          onClick={() => void saveDraft()}
                        >
                          {editSaving ? "저장 중…" : "저장"}
                        </button>
                      </RulesMetaHintButton>
                    </>
                  );
                })()}
                {(() => {
                  const newVersionReason = getNewVersionDisabledReason(
                    editSaving,
                    editLoading,
                    selected.status,
                  );
                  const newVersionDisabled = newVersionReason != null;
                  return (
                    <RulesMetaHintButton
                      hint={
                        newVersionReason ??
                        "현재 YAML로 새 draft 번들(다음 버전)을 만듭니다."
                      }
                    >
                      <button
                        type="button"
                        className="h-9 px-3 rounded-sm border border-dashed border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                        disabled={newVersionDisabled}
                        onClick={() => void saveNewVersion()}
                      >
                        새 버전 만들기
                      </button>
                    </RulesMetaHintButton>
                  );
                })()}
                <button
                  type="button"
                  className="h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                  disabled={editSaving || selected.status === "active"}
                  onClick={() => void runApprove()}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded-sm border border-primary/40 text-sm font-medium hover:bg-primary/10 disabled:opacity-50"
                  disabled={editSaving || selected.status === "active"}
                  onClick={() => setActivateConfirmOpen(true)}
                >
                  활성화
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
                  onClick={requestClosePanel}
                >
                  닫기
                </button>
              </DialogFooter>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={closeConfirmOpen}
        onOpenChange={(open) => {
          if (editSaving) return;
          setCloseConfirmOpen(open);
        }}
      >
        <AlertDialogContent className="z-[110] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>저장되지 않은 변경 사항이 있어요</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block text-xs">
                닫으면 방금 편집한 내용이 사라집니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel type="button" disabled={editSaving}>
              계속 편집
            </AlertDialogCancel>
            {selected && (selected.status || "").toLowerCase() === "draft" ? (
              <AlertDialogAction
                type="button"
                disabled={editSaving || editLoading}
                onClick={() => {
                  void (async () => {
                    const ok = await saveDraft();
                    if (ok) closePanel();
                  })();
                }}
              >
                저장하고 닫기
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              type="button"
              disabled={editSaving}
              onClick={() => closePanel()}
            >
              그냥 닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={activateConfirmOpen}
        onOpenChange={(open) => {
          if (!editSaving) setActivateConfirmOpen(open);
        }}
      >
        <AlertDialogContent className="z-[100] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>이 버전을 활성화할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {selected ? (
                <>
                  <span className="block">
                    <span className="font-mono font-medium text-foreground">
                      {selected.serviceCode}
                    </span>
                    {" · "}
                    v{selected.bundleVersion} (#{selected.bundleId})
                  </span>
                  <span className="block text-xs">
                    활성화하면 이 번들이 운영(Active) 규칙이 되며, 테스트케이스
                    「YAML에서 생성」에 사용됩니다. 같은 서비스의 기존 Active
                    번들은 superseded로 바뀝니다.
                  </span>
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={editSaving}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={editSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault();
                setActivateConfirmOpen(false);
                void runActivate();
              }}
            >
              활성화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={yamlAiOpen} onOpenChange={closeYamlAi}>
        <DialogContent
          className={FINIX_LARGE_MODAL_CONTENT}
          onInteractOutside={(e) => {
            if (yamlAiSubmitting) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (yamlAiSubmitting) e.preventDefault();
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border text-left space-y-1 shrink-0">
            <DialogTitle className="text-lg font-semibold">
              YAML 등록 — 소스 기반 AI
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-left">
              카탈로그에 등록된 서비스를 선택한 뒤, 컨트롤러·서비스·검증기 등 관련
              소스를 붙여넣으세요. LLM이 템플릿 구조에 맞춘 YAML을 만든 뒤 서버에서
              검증하고 새 드래프트 번들로 저장합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex-1 min-h-0 flex flex-col">
            {yamlAiSubmitting ? (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[1px]"
                aria-live="polite"
                aria-busy="true"
              >
                <FinixLoading size="lg" label="YAML 생성 및 등록 중…" />
                <p className="text-xs text-muted-foreground -mt-1 text-center max-w-sm px-4 whitespace-pre-line">
                  {yamlAiWaitMessage}
                </p>
              </div>
            ) : null}

            <div
              className={cn(
                "px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0",
                yamlAiSubmitting && "pointer-events-none opacity-60",
              )}
            >
              {yamlAiError || yamlAiCatalogError ? (
                <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
                  {yamlAiError ?? yamlAiCatalogError}
                </div>
              ) : null}

              <FinixField
                label="서비스"
                helperText="코드 또는 이름으로 검색 후 선택 (검색 결과 최대 50건)"
              >
                <ServiceCatalogCombobox
                  key={yamlAiPickerKey}
                  options={yamlAiCatalog}
                  value={yamlAiService}
                  onValueChange={setYamlAiService}
                  loading={yamlAiCatalogLoading}
                  disabled={yamlAiCatalog.length === 0 || yamlAiSubmitting}
                />
              </FinixField>

              <FinixField
                label="소스 라벨 (source_version)"
                helperText="번들에 기록되는 문자열 (브랜치명, 커밋, 티켓 등)"
              >
                <FinixUnderlineInput
                  value={yamlAiSourceVersion}
                  onChange={(e) => setYamlAiSourceVersion(e.target.value)}
                  placeholder="source-scan"
                  disabled={yamlAiSubmitting}
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
                  disabled={yamlAiSubmitting}
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
                  disabled={yamlAiSubmitting}
                />
              </FinixField>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 flex-row justify-end gap-2 shrink-0">
            <button
              type="button"
              className="h-10 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
              disabled={yamlAiSubmitting}
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
                <FinixLoading size="sm" inline />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              생성 · DB 등록
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={yamlAiSuccessOpen} onOpenChange={closeYamlAiSuccess}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 text-left space-y-2">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <DialogTitle className="text-lg font-semibold">
                YAML 등록 완료
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-left">
              드래프트가 성공적으로 등록되었습니다.
            </DialogDescription>
          </DialogHeader>
          {yamlAiSuccessBundle ? (
            <div className="px-6 pb-2 text-sm space-y-2">
              <p className="text-muted-foreground">
                서비스{" "}
                <span className="font-mono font-medium text-foreground">
                  {yamlAiSuccessBundle.service_code}
                </span>
                {yamlAiSuccessBundle.service_name_snapshot
                  ? ` · ${yamlAiSuccessBundle.service_name_snapshot}`
                  : null}
              </p>
              <p className="text-xs font-mono text-muted-foreground">
                bundle #{yamlAiSuccessBundle.id} · 버전 v
                {yamlAiSuccessBundle.version} · {yamlAiSuccessBundle.status}
              </p>
              <p className="text-[11px] text-muted-foreground">
                이후 승인·활성화는 규칙 목록에서 진행할 수 있습니다.
              </p>
            </div>
          ) : null}
          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
            <FinixPrimaryButton
              type="button"
              className="h-10 px-6 w-full sm:w-auto"
              onClick={() => closeYamlAiSuccess(false)}
            >
              확인
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RulesMetaHistoryDialog
        item={historyRow}
        open={historyRow != null}
        onOpenChange={(open) => {
          if (!open) setHistoryItem(null);
        }}
        onEditVersion={handleEditFromHistory}
        onRefreshRegistry={async (): Promise<void> => {
          await reloadRegistry();
        }}
      />
    </PageShell>
  );
}
