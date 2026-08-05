import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  RotateCw,
  Search,
  Sparkles,
  History,
  FileDown,
  X,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { PageShell } from "./PageShell";
import { TablePagination } from "./ui/finix-pagination";
import {
  FinixDataTable,
  FinixDataTableBody,
  FinixDataTableCell,
  FinixDataTableFrame,
  FinixDataTableHead,
  FinixDataTableHeader,
  FinixDataTableRow,
  FINIX_DATA_TABLE_HUG_CLASS,
  FINIX_DATA_TABLE_ICON_BTN_CLASS,
  FINIX_DATA_TABLE_STACK_CLASS,
} from "./ui/finix-data-table";
import {
  FinixField,
  FinixUnderlineInput,
  FinixUnderlineSelect,
  FinixUnderlineTextarea,
} from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixLoading } from "./ui/finix-loading";
import {
  FinixStatusBadge,
  rulesRegistryStatusBadge,
} from "./ui/finix-status-badge";
import { PostmanRulesImportDialog } from "./rules/PostmanRulesImportDialog";
import { RulesDomainNav } from "./rules/RulesDomainNav";
import { RulesMetaHistoryDialog } from "./rules/RulesMetaHistoryDialog";
import { RulesMetaHintButton } from "./rules/RulesMetaHintButton";
import { RulesMetaTestCasesPanel } from "./rules/RulesMetaTestCasesPanel";
import { YamlAiJobBanner } from "./rules/YamlAiJobBanner";
import { YamlRulesEditPanel } from "./rules/YamlRulesEditPanel";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import {
  activateServiceRulesBundle,
  createServiceRulesDraft,
  getServiceRulesBundle,
  updateServiceRulesDraft,
} from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";
import { useYamlAiJobStore, type YamlAiJob } from "@/app/stores/yamlAiJobStore";
import {
  mergeSelectedWithBundle,
  type RuleRegistryItem,
  useRulesRegistry,
} from "@/hooks/useRulesRegistry";
import {
  buildDomainNavNodes,
  domainLabel,
  inferBusinessDomain,
  matchesDomainSelection,
  type RulesDomainSelection,
  UNCLASSIFIED_DOMAIN,
} from "@/lib/cbsServiceTaxonomy";
import {
  registryStatusHint,
  registryVersionHint,
} from "@/lib/formatRegistryVersions";
import { getSaveDraftDisabledReason } from "@/lib/saveDraftDisabledReason";
import {
  clearRulesMetaResume,
  peekRulesMetaResume,
  type RulesMetaResumeState,
} from "@/lib/rulesMetaResume";
import { useAuthStore } from "../auth/authStore";
import {
  FINIX_LARGE_MODAL_CONTENT,
  FINIX_LARGE_MODAL_WITH_RAIL_CONTENT,
} from "@/lib/finixModalLayout";
import { cn } from "./ui/utils";

type SortKey =
  | "code_asc"
  | "name_asc"
  | "updated_desc"
  | "rules_desc";

function StatusPill({ status }: { status: string }) {
  const { tone, label } = rulesRegistryStatusBadge(status);
  return <FinixStatusBadge tone={tone}>{label}</FinixStatusBadge>;
}

const SECONDARY_BTN_CLASS =
  "h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50";

const YAML_AI_MIN_SOURCE_LENGTH = 16;

function compareUpdated(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function bundleToRegistryItem(bundle: ServiceRuleBundleReadDto): RuleRegistryItem {
  const rulesArr =
    bundle.rules && Array.isArray((bundle.rules as { rules?: unknown }).rules)
      ? (bundle.rules as { rules: unknown[] }).rules
      : null;
  const hasDraft = bundle.has_draft ?? (bundle.status || "").toLowerCase() === "draft";
  return {
    serviceCode: bundle.service_code,
    serviceName: bundle.service_name_snapshot ?? bundle.service_code,
    sourceVersion: bundle.source_version ?? "—",
    status: bundle.status,
    rules: rulesArr?.length ?? 0,
    bundleId: bundle.id,
    bundleVersion: bundle.version,
    lastUpdatedAt: "—",
    lastUpdatedBy: bundle.created_by ?? "—",
    isActive: bundle.is_active ?? false,
    versionCount: 0,
    activeBundleVersion: bundle.is_active ? 1 : null,
    draftBundleVersion: hasDraft ? 1 : null,
    hasApproved: false,
    hasDraft,
    businessDomain:
      inferBusinessDomain(bundle.service_code) || UNCLASSIFIED_DOMAIN,
    componentCode: "",
  };
}

function statusFilterFromSearch(raw: string | null): "" | "active" | "draft" {
  if (raw === "active" || raw === "draft") return raw;
  return "";
}

function resumeFromSearchParams(
  params: URLSearchParams,
): Omit<RulesMetaResumeState, "savedAt"> | null {
  const serviceCode = (params.get("openService") || "").trim();
  const bundleRaw = params.get("openBundle");
  const tabRaw = params.get("openTab");
  if (!serviceCode || !bundleRaw) return null;
  const bundleId = Number(bundleRaw);
  if (!Number.isFinite(bundleId)) return null;
  const activeTab = tabRaw === "yaml" ? "yaml" : "testcases";
  return {
    serviceCode,
    bundleId,
    activeTab,
  };
}

/** Prevents double-open under React Strict Mode remounts. */
let rulesMetaResumeConsumeKey: string | null = null;

export function RulesMeta() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RuleRegistryItem | null>(null);
  const [activeTab, setActiveTab] = useState<"yaml" | "testcases">("yaml");
  const [yamlText, setYamlText] = useState("");
  const [baselineYamlText, setBaselineYamlText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "draft">(() =>
    statusFilterFromSearch(searchParams.get("status")),
  );
  const [versionFilter, setVersionFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code_asc");
  const [domainSelection, setDomainSelection] = useState<RulesDomainSelection>({
    type: "all",
  });
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
  const [yamlMacroPanelOpen, setYamlMacroPanelOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<RuleRegistryItem | null>(null);

  useEffect(() => {
    setStatusFilter(statusFilterFromSearch(searchParams.get("status")));
  }, [searchParams]);

  const {
    registry,
    loading: registryLoading,
    error: registryError,
    load: reloadRegistry,
  } = useRulesRegistry({ query, statusFilter });

  const [postmanImportOpen, setPostmanImportOpen] = useState(false);
  const [yamlAiOpen, setYamlAiOpen] = useState(false);
  const [yamlAiPickerKey, setYamlAiPickerKey] = useState(0);
  const {
    options: yamlAiCatalog,
    loading: yamlAiCatalogLoading,
    error: yamlAiCatalogError,
  } = useServiceCatalogPicker({ enabled: yamlAiOpen });
  const [yamlAiService, setYamlAiService] = useState("");
  const [yamlAiSourceVersion, setYamlAiSourceVersion] = useState("");
  const [yamlAiSource, setYamlAiSource] = useState("");
  const [yamlAiHints, setYamlAiHints] = useState("");
  const [yamlAiUseDataPool, setYamlAiUseDataPool] = useState(false);
  const [yamlAiUseSwagger, setYamlAiUseSwagger] = useState(false);
  const [yamlAiAdvancedOpen, setYamlAiAdvancedOpen] = useState(false);
  const [yamlAiError, setYamlAiError] = useState<string | null>(null);
  const yamlAiServiceInputRef = useRef<HTMLInputElement>(null);
  const yamlAiJobs = useYamlAiJobStore((s) => s.jobs);
  const startYamlAiJob = useYamlAiJobStore((s) => s.startJob);
  const dismissYamlAiJob = useYamlAiJobStore((s) => s.dismissJob);

  const focusYamlAiServiceSearch = useCallback(() => {
    window.setTimeout(() => {
      const el = yamlAiServiceInputRef.current;
      if (!el || el.disabled) return;
      el.focus();
      el.select?.();
    }, 50);
  }, []);

  useEffect(() => {
    if (!yamlAiOpen) return;
    focusYamlAiServiceSearch();
  }, [yamlAiOpen, yamlAiCatalogLoading, yamlAiPickerKey, focusYamlAiServiceSearch]);

  const prevYamlJobStatuses = useRef<Record<string, YamlAiJob["status"]>>({});
  useEffect(() => {
    const prev = prevYamlJobStatuses.current;
    let shouldReload = false;
    for (const job of yamlAiJobs) {
      if (job.status === "success" && prev[job.id] === "running") {
        shouldReload = true;
      }
    }
    prevYamlJobStatuses.current = Object.fromEntries(
      yamlAiJobs.map((j) => [j.id, j.status]),
    );
    if (shouldReload) void reloadRegistry();
  }, [yamlAiJobs, reloadRegistry]);

  const uniqueVersions = useMemo(() => {
    const s = new Set(
      registry.map((r) => r.sourceVersion).filter((v) => v && v !== "—"),
    );
    return [...s].sort();
  }, [registry]);

  const domainNavNodes = useMemo(
    () => buildDomainNavNodes(registry),
    [registry],
  );

  const domainScopeLabel = useMemo(() => {
    if (domainSelection.type === "all") return "전체";
    return domainLabel(domainSelection.domain);
  }, [domainSelection]);

  const filteredSorted = useMemo(() => {
    let list = registry.filter((x) => {
      if (!matchesDomainSelection(x, domainSelection)) return false;
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
  }, [registry, versionFilter, sortKey, domainSelection]);

  const handleDomainSelect = (next: RulesDomainSelection) => {
    setDomainSelection(next);
    setPage(1);
  };

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

  const openEdit = async (
    item: RuleRegistryItem,
    bundleId?: number,
    tab: "yaml" | "testcases" = "yaml",
  ) => {
    const row = resolveRegistryRow(item);
    setSelected(row);
    setActiveTab(tab);
    setYamlText("");
    setLastSavedAt(null);
    setEditError(null);
    setEditNotice(null);
    setYamlCopyDone(false);
    await loadBundleYaml(row.serviceCode, bundleId ?? row.bundleId);
  };

  useEffect(() => {
    if (registryLoading) return;
    const fromQuery = resumeFromSearchParams(searchParams);
    const stored = fromQuery ? null : peekRulesMetaResume();
    const resume = fromQuery ?? stored;
    if (!resume) return;

    const consumeKey = fromQuery
      ? `q:${resume.serviceCode}:${resume.bundleId}:${resume.activeTab}`
      : `s:${stored!.savedAt}:${resume.serviceCode}:${resume.bundleId}`;
    if (rulesMetaResumeConsumeKey === consumeKey) return;

    const item = registry.find((r) => r.serviceCode === resume.serviceCode);
    if (!item) {
      if (fromQuery) {
        rulesMetaResumeConsumeKey = consumeKey;
        clearRulesMetaResume();
        navigate("/rules", { replace: true });
      }
      return;
    }

    rulesMetaResumeConsumeKey = consumeKey;
    clearRulesMetaResume();
    if (fromQuery) {
      navigate("/rules", { replace: true });
    }
    void openEdit(item, resume.bundleId, resume.activeTab);
    // Resume once when registry is ready; openEdit closes over latest loadBundleYaml.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryLoading, registry, searchParams, navigate]);

  const openHistory = (item: RuleRegistryItem) => {
    setHistoryItem(resolveRegistryRow(item));
  };

  const handleRestoredFromHistory = async () => {
    setHistoryItem(null);
    await reloadRegistry();
  };

  const closePanel = () => {
    clearRulesMetaResume();
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
    setEditSaving(true);
    setEditError(null);
    setEditNotice(null);
    try {
      const bundle = selected.hasDraft
        ? await updateServiceRulesDraft(
            selected.serviceCode,
            selected.bundleId,
            draftPayload(),
          )
        : await createServiceRulesDraft(selected.serviceCode, draftPayload());
      const items = await reloadRegistry();
      applySavedBundle(bundle, "작업본에 저장되었습니다.", items);
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
        "적용되었습니다. 테스트 케이스 생성에 사용됩니다.",
        items,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "적용에 실패했습니다.",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const submitYamlFromSource = () => {
    const code = yamlAiService.trim();
    const src = yamlAiSource.trim();
    if (!code) {
      setYamlAiError("서비스를 선택하세요.");
      return;
    }
    if (src.length < YAML_AI_MIN_SOURCE_LENGTH) {
      setYamlAiError(
        `소스 코드는 최소 ${YAML_AI_MIN_SOURCE_LENGTH}자 이상 붙여넣어 주세요.`,
      );
      return;
    }
    setYamlAiError(null);
    startYamlAiJob({
      serviceCode: code,
      source_code: yamlAiSource,
      source_version: yamlAiSourceVersion.trim() || null,
      hints: yamlAiHints.trim() || null,
      created_by: user?.username ?? null,
      use_data_pool: yamlAiUseDataPool,
      use_swagger: yamlAiUseSwagger,
    });
    resetYamlAiForm();
    setYamlAiOpen(false);
  };

  const resetYamlAiForm = () => {
    setYamlAiService("");
    setYamlAiError(null);
    setYamlAiSource("");
    setYamlAiHints("");
    setYamlAiSourceVersion("");
    setYamlAiUseDataPool(false);
    setYamlAiUseSwagger(false);
    setYamlAiAdvancedOpen(false);
  };

  const closeYamlAi = (open: boolean) => {
    if (open) return;
    setYamlAiOpen(false);
    resetYamlAiForm();
  };

  const openYamlAiDialog = () => {
    setYamlAiService("");
    setYamlAiPickerKey((k) => k + 1);
    setYamlAiAdvancedOpen(false);
    setYamlAiOpen(true);
    setYamlAiError(null);
  };

  const openJobDraft = (job: YamlAiJob) => {
    const bundle = job.bundle;
    if (!bundle) return;
    dismissYamlAiJob(job.id);
    const row =
      registry.find((r) => r.serviceCode === bundle.service_code) ??
      bundleToRegistryItem(bundle);
    void openEdit(row, bundle.id);
  };

  const yamlAiSourceLen = yamlAiSource.trim().length;
  const yamlAiSourceReady = yamlAiSourceLen >= YAML_AI_MIN_SOURCE_LENGTH;

  const selectedStatus = (selected?.status || "draft").toLowerCase();
  const hasWorkingDraft = Boolean(selected?.hasDraft) || selectedStatus === "draft";
  const canApply = hasWorkingDraft && !hasUnsavedChanges;

  return (
    <PageShell
      icon={<Layers className="w-5 h-5" strokeWidth={2} />}
      title="YAML 규칙"
      bodyClassName="overflow-hidden flex flex-col pt-3"
      actions={
        yamlAiJobs.length > 0 ? (
          <YamlAiJobBanner onOpenBundle={openJobDraft} />
        ) : undefined
      }
    >

        <div className="flex flex-col gap-3 flex-1 min-h-0">

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-2 shrink-0">
          {registryError ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{registryError}</span>
              <button
                type="button"
                className="text-xs font-medium underline hover:no-underline shrink-0"
                onClick={() => void reloadRegistry()}
              >
                다시 시도
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[min(100%,12rem)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <FinixUnderlineInput
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="코드, 이름 검색"
                className="h-9 pl-9 pr-9 bg-card"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="검색 초기화"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-sm hover:bg-muted text-muted-foreground"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <FinixField label="정렬" className="min-w-[10rem]">
              <FinixUnderlineSelect
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as SortKey);
                  setPage(1);
                }}
              >
                <option value="code_asc">서비스 코드 · A→Z</option>
                <option value="updated_desc">수정일 · 최신순</option>
                <option value="name_asc">서비스명 · 가나다</option>
                <option value="rules_desc">규칙 수 · 많은순</option>
              </FinixUnderlineSelect>
            </FinixField>

            <FinixField label="상태" className="min-w-[7.5rem]">
              <FinixUnderlineSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
              >
                <option value="">전체</option>
                <option value="active">적용됨</option>
                <option value="draft">작업 중</option>
              </FinixUnderlineSelect>
            </FinixField>

            <FinixField label="소스 버전" className="min-w-[10rem]">
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

            <button
              type="button"
              title="목록 새로고침"
              aria-label="목록 새로고침"
              disabled={registryLoading}
              onClick={() => void reloadRegistry()}
              className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50 mb-0.5"
            >
              <RotateCw
                className={`w-4 h-4 ${registryLoading ? "animate-spin" : ""}`}
              />
            </button>

            <FinixPrimaryButton
              type="button"
              className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5 shrink-0 mb-0.5"
              onClick={openYamlAiDialog}
            >
              <Sparkles className="w-3.5 h-3.5" />
              소스에서 YAML 생성
            </FinixPrimaryButton>
            <button
              type="button"
              className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5 shrink-0 mb-0.5 inline-flex items-center border border-border bg-background hover:bg-muted"
              onClick={() => setPostmanImportOpen(true)}
            >
              <FileDown className="w-3.5 h-3.5" />
              Postman에서 가져오기
            </button>
          </div>
        </div>

        <div
          className={cn(
            FINIX_DATA_TABLE_STACK_CLASS,
            "bg-card border border-border rounded-sm overflow-hidden",
          )}
        >
          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
            <aside className="md:w-[15rem] lg:w-[16.5rem] shrink-0 border-b md:border-b-0 md:border-r border-border max-h-[38%] md:max-h-none flex flex-col min-h-0">
              <RulesDomainNav
                nodes={domainNavNodes}
                selection={domainSelection}
                onSelect={handleDomainSelect}
              />
            </aside>

            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
              <div className="h-11 px-4 border-b border-border shrink-0 flex items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground min-w-0 truncate">
                  현재 범위:{" "}
                  <span className="text-foreground font-medium">
                    {domainScopeLabel}
                  </span>
                </div>
                <div className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {filteredSorted.length}
                  </span>
                  건
                </div>
              </div>

              <div className={cn(FINIX_DATA_TABLE_HUG_CLASS, "flex-1 p-0")}>
                <FinixDataTableFrame className="rounded-none border-0">
                  <FinixDataTable>
                    <FinixDataTableHeader>
                      <FinixDataTableRow className="hover:bg-transparent">
                        <FinixDataTableHead className="whitespace-nowrap">
                          코드
                        </FinixDataTableHead>
                        <FinixDataTableHead className="min-w-[180px]">
                          서비스명
                        </FinixDataTableHead>
                        <FinixDataTableHead>상태</FinixDataTableHead>
                        <FinixDataTableHead className="text-right">
                          규칙
                        </FinixDataTableHead>
                        <FinixDataTableHead className="whitespace-nowrap">
                          수정
                        </FinixDataTableHead>
                        <FinixDataTableHead className="w-[72px] text-right">
                          이력
                        </FinixDataTableHead>
                      </FinixDataTableRow>
                    </FinixDataTableHeader>
                    <FinixDataTableBody>
                      {registryLoading ? (
                        <FinixDataTableRow>
                          <FinixDataTableCell
                            colSpan={6}
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
                      ) : pageRows.length === 0 ? (
                        <FinixDataTableRow>
                          <FinixDataTableCell
                            colSpan={6}
                            className="py-12 text-center text-muted-foreground text-sm"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <p>
                                {query ||
                                statusFilter ||
                                versionFilter ||
                                domainSelection.type !== "all"
                                  ? "조건에 맞는 규칙 번들이 없습니다."
                                  : "등록된 규칙 번들이 없습니다."}
                              </p>
                              {!query &&
                              !statusFilter &&
                              !versionFilter &&
                              domainSelection.type === "all" ? (
                                <FinixPrimaryButton
                                  type="button"
                                  className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
                                  onClick={openYamlAiDialog}
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  소스에서 YAML 생성
                                </FinixPrimaryButton>
                              ) : null}
                            </div>
                          </FinixDataTableCell>
                        </FinixDataTableRow>
                      ) : (
                        pageRows.map((item) => (
                          <FinixDataTableRow
                            key={`${item.serviceCode}:${item.bundleId}`}
                            interactive
                            onClick={() => void openEdit(item)}
                          >
                            <FinixDataTableCell
                              className="font-mono text-sm font-medium"
                              title={
                                registryVersionHint(item) ??
                                `편집 대상 #${item.bundleId}`
                              }
                            >
                              {item.serviceCode}
                            </FinixDataTableCell>
                            <FinixDataTableCell className="text-sm">
                              {item.serviceName}
                            </FinixDataTableCell>
                            <FinixDataTableCell
                              title={registryStatusHint(item)}
                            >
                              <StatusPill status={item.status} />
                            </FinixDataTableCell>
                            <FinixDataTableCell className="text-right tabular-nums text-sm">
                              {item.rules}
                            </FinixDataTableCell>
                            <FinixDataTableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {item.lastUpdatedAt}
                            </FinixDataTableCell>
                            <FinixDataTableCell className="text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openHistory(item);
                                }}
                                title={`변경 이력 (${item.versionCount})`}
                                aria-label={`${item.serviceCode} 변경 이력 ${item.versionCount}건`}
                                className={FINIX_DATA_TABLE_ICON_BTN_CLASS}
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                            </FinixDataTableCell>
                          </FinixDataTableRow>
                        ))
                      )}
                    </FinixDataTableBody>
                  </FinixDataTable>
                </FinixDataTableFrame>

                <div className="shrink-0 px-3 pb-3 pt-2">
                  <TablePagination
                    summary={
                      <>
                        표시 중{" "}
                        {filteredSorted.length === 0
                          ? 0
                          : (currentPage - 1) * pageSize + 1}
                        –
                        {Math.min(
                          currentPage * pageSize,
                          filteredSorted.length,
                        )}{" "}
                        / 총 {filteredSorted.length}건
                      </>
                    }
                    pageSize={pageSize}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pagesToShow={pagesToShow}
                    onPageChange={setPage}
                    controlsClassName="justify-end"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) requestClosePanel();
        }}
      >
        <DialogContent
          className={
            yamlMacroPanelOpen && activeTab === "yaml"
              ? FINIX_LARGE_MODAL_WITH_RAIL_CONTENT
              : FINIX_LARGE_MODAL_CONTENT
          }
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {selected && (
            <>
              <DialogHeader
                className={cn(
                  "px-6 border-b border-border shrink-0 text-left",
                  yamlRuleFocusEdit ? "pt-4 pb-3" : "pt-5 pb-4",
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
                  <StatusPill status={selected.status} />
                </div>
              </DialogHeader>

              {!yamlRuleFocusEdit ? (
              <div className="px-6 pt-1 shrink-0">
                <div className="flex gap-1 border-b border-border">
                  {(
                    [
                      { id: "yaml" as const, label: "YAML 편집" },
                      { id: "testcases" as const, label: "테스트케이스" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={cn(
                        "px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                        activeTab === t.id
                          ? "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <div
                className={cn(
                  "px-6 flex-1 min-h-0 overflow-x-hidden",
                  yamlRuleFocusEdit ? "py-2" : "py-4",
                  activeTab === "yaml" || activeTab === "testcases"
                    ? "flex flex-col overflow-hidden"
                    : "flex flex-col overflow-y-auto min-h-0",
                )}
              >
                {activeTab === "testcases" ? (
                  <RulesMetaTestCasesPanel
                    serviceCode={selected.serviceCode}
                    resumeBundleId={selected.bundleId}
                    yamlText={yamlText}
                    activeBundleVersion={selected.activeBundleVersion}
                    editingDraft={
                      selected.hasDraft ||
                      (selected.status || "").toLowerCase() === "draft"
                    }
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
                    onMacroPanelOpenChange={setYamlMacroPanelOpen}
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
                    hasUnsavedChanges,
                  );
                  const saveDisabled = saveDisabledReason != null;
                  const applyDisabled =
                    editSaving || editLoading || !canApply;

                  return (
                    <>
                      <button
                        type="button"
                        className={SECONDARY_BTN_CLASS}
                        onClick={requestClosePanel}
                      >
                        닫기
                      </button>

                      <RulesMetaHintButton
                        hint={
                          saveDisabledReason ??
                          "편집 내용을 작업본으로 저장합니다. 적용 전까지 테스트케이스 생성에는 반영되지 않습니다."
                        }
                      >
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          disabled={saveDisabled}
                          onClick={() => void saveDraft()}
                        >
                          {editSaving ? "저장 중…" : "저장"}
                        </button>
                      </RulesMetaHintButton>

                      {hasWorkingDraft ? (
                        <FinixPrimaryButton
                          type="button"
                          className="h-9 px-3 w-auto text-sm"
                          disabled={applyDisabled}
                          onClick={() => setActivateConfirmOpen(true)}
                        >
                          적용
                        </FinixPrimaryButton>
                      ) : null}
                    </>
                  );
                })()}
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
            {selected && hasUnsavedChanges ? (
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
            <AlertDialogTitle>작업본을 적용할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {selected ? (
                <>
                  <span className="block">
                    <span className="font-mono font-medium text-foreground">
                      {selected.serviceCode}
                    </span>
                  </span>
                  <span className="block text-xs">
                    적용하면 작업본이 현재 규칙이 되며, 테스트케이스
                    「테스트케이스 생성」에 사용됩니다. 기존 적용본은 이력으로
                    보관됩니다.
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
              적용
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={yamlAiOpen} onOpenChange={closeYamlAi}>
        <DialogContent
          className={FINIX_LARGE_MODAL_CONTENT}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            focusYamlAiServiceSearch();
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border text-left shrink-0">
            <DialogTitle className="text-lg font-semibold">
              소스에서 YAML 생성
            </DialogTitle>
          </DialogHeader>

          <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                  inputRef={yamlAiServiceInputRef}
                />
              </FinixField>

              <div className="space-y-1.5">
                <FinixField
                  label="소스 코드"
                  helperText="Java/Kotlin/Spring 등 백엔드 소스. 최대 약 12만 자."
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
                <p
                  className={cn(
                    "text-[11px] tabular-nums",
                    yamlAiSourceLen === 0
                      ? "text-muted-foreground"
                      : yamlAiSourceReady
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {yamlAiSourceLen === 0
                    ? `최소 ${YAML_AI_MIN_SOURCE_LENGTH}자 필요`
                    : yamlAiSourceReady
                      ? `${yamlAiSourceLen.toLocaleString("ko-KR")}자 · 생성 가능`
                      : `${yamlAiSourceLen.toLocaleString("ko-KR")}자 / 최소 ${YAML_AI_MIN_SOURCE_LENGTH}자`}
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={yamlAiUseDataPool}
                      onChange={(e) => setYamlAiUseDataPool(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Data Pool 참조</span>
                      <span className="block text-[11px] text-muted-foreground">
                        Happy 샘플 필드를 힌트로만 주입합니다.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={yamlAiUseSwagger}
                      onChange={(e) => setYamlAiUseSwagger(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Swagger/OpenAPI 참조</span>
                      <span className="block text-[11px] text-muted-foreground">
                        등록된 operation 힌트만 추가합니다.{" "}
                        <a
                          href="/openapi"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          스펙 등록 (새 탭)
                        </a>
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-sm border border-border bg-muted/20 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
                  onClick={() => setYamlAiAdvancedOpen((o) => !o)}
                  aria-expanded={yamlAiAdvancedOpen}
                >
                  <span>옵션</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    소스 버전 · 힌트
                    {yamlAiAdvancedOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>
                {yamlAiAdvancedOpen ? (
                  <div className="px-3 pb-3 pt-1 space-y-4 border-t border-border">
                    <FinixField
                      label="소스 버전"
                      helperText="번들에 기록되는 문자열 (브랜치명, 커밋, 티켓 등, 선택)"
                    >
                      <FinixUnderlineInput
                        value={yamlAiSourceVersion}
                        onChange={(e) => setYamlAiSourceVersion(e.target.value)}
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
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 flex-row justify-end gap-2 shrink-0">
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
                yamlAiCatalogLoading || !yamlAiService || !yamlAiSourceReady
              }
              onClick={() => submitYamlFromSource()}
            >
              <Sparkles className="w-4 h-4" />
              초안 생성
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
        onRestored={handleRestoredFromHistory}
        onRefreshRegistry={async (): Promise<void> => {
          await reloadRegistry();
        }}
      />

      <PostmanRulesImportDialog
        open={postmanImportOpen}
        onOpenChange={setPostmanImportOpen}
      />
    </PageShell>
  );
}
