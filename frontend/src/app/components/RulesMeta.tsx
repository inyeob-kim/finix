import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
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
import {
  RulesMetaTestCaseRunDialog,
  type RulesMetaRunSession,
} from "./rules/RulesMetaTestCaseRunDialog";
import { YamlAiJobBanner } from "./rules/YamlAiJobBanner";
import { YamlRulesEditPanel } from "./rules/YamlRulesEditPanel";
import { RulesMetaFooterMessage } from "./rules/RulesMetaFooterMessage";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import {
  activateServiceRulesBundle,
  applyServiceRuleCase,
  deactivateServiceRuleCase,
  createServiceRulesDraft,
  getServiceRulesBundle,
  listServiceRuleCases,
  updateServiceRulesDraft,
} from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import { materializeOneRuleCase } from "@/api/testcaseApi";
import type {
  ServiceRuleBundleReadDto,
  ServiceRuleCaseMetaDto,
  ServiceRuleEditorCasesDto,
  TestCaseReadDto,
} from "@/api/types";
import { toast } from "sonner";
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
  FINIX_STANDARD_SHEET_CONTENT,
  FINIX_STANDARD_SHEET_WITH_RAIL_CONTENT,
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
const EDIT_NOTICE_DISMISS_MS = 4000;

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
  const [caseMeta, setCaseMeta] = useState<ServiceRuleCaseMetaDto[]>([]);
  const [togglingCaseId, setTogglingCaseId] = useState<string | null>(null);
  const [materializingCaseId, setMaterializingCaseId] = useState<string | null>(
    null,
  );
  const [materializeConfirmCaseId, setMaterializeConfirmCaseId] = useState<
    string | null
  >(null);
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
  const [historyItem, setHistoryItem] = useState<RuleRegistryItem | null>(null);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [poolRows, setPoolRows] = useState<TestCaseReadDto[]>([]);
  const [runSession, setRunSession] = useState<RulesMetaRunSession | null>(null);
  const poolRefreshRef = useRef<(() => Promise<void>) | null>(null);

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
  const [yamlAiError, setYamlAiError] = useState<string | null>(null);
  const yamlAiServiceInputRef = useRef<HTMLInputElement>(null);
  const yamlAiJobs = useYamlAiJobStore((s) => s.jobs);
  const startYamlAiJob = useYamlAiJobStore((s) => s.startJob);

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

  const loadEditor = async (
    serviceCode: string,
    bundleId: number,
    currentBundleId: number,
  ) => {
    setEditLoading(true);
    setEditError(null);
    try {
      if (bundleId !== currentBundleId) {
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
        return;
      }

      const editor = await listServiceRuleCases(serviceCode);
      const nextYaml = editor?.yaml_text ?? "";
      setYamlText(nextYaml);
      setBaselineYamlText(nextYaml);
      setCaseMeta(editor?.case_meta ?? []);
      setSelected((prev) =>
        prev && prev.serviceCode === serviceCode
          ? {
              ...prev,
              bundleId: editor?.bundle_id ?? prev.bundleId,
              bundleVersion: editor?.is_active ? 1 : 0,
              status: editor?.status ?? prev.status,
              rules: editor?.rules.length ?? prev.rules,
              sourceVersion: editor?.source_version ?? "—",
            }
          : prev,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "편집 데이터를 불러오지 못했습니다.",
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
    await loadEditor(row.serviceCode, bundleId ?? row.bundleId, row.bundleId);
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
    // Resume once when registry is ready; openEdit closes over latest loadEditor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryLoading, registry, searchParams, navigate]);

  const openHistory = (item: RuleRegistryItem) => {
    setHistoryItem(resolveRegistryRow(item));
  };

  const handleRestoredFromHistory = async () => {
    setHistoryItem(null);
    await reloadRegistry();
  };

  const handleRunRunningChange = useCallback(
    (loading: boolean, caseId: string | null) => {
      setRunningCaseId(loading ? caseId : null);
    },
    [],
  );

  const refreshCaseMeta = useCallback(async (serviceCode: string) => {
    const editor = await listServiceRuleCases(serviceCode);
    if (editor) {
      setCaseMeta(editor.case_meta ?? []);
    }
  }, []);

  const refreshPoolRows = useCallback(async () => {
    await poolRefreshRef.current?.();
    if (selected?.serviceCode) {
      await refreshCaseMeta(selected.serviceCode);
    }
  }, [selected?.serviceCode, refreshCaseMeta]);

  const registerPoolRefresh = useCallback((refresh: () => Promise<void>) => {
    poolRefreshRef.current = refresh;
  }, []);

  const handlePoolRowsChange = useCallback((rows: TestCaseReadDto[]) => {
    setPoolRows(rows);
  }, []);

  const openEditorCaseRun = useCallback((caseId: string) => {
    if (!caseId.trim()) return;
    setRunSession({ kind: "editor", caseId: caseId.trim() });
  }, []);

  const handleMaterializeOneCase = useCallback(
    async (caseId: string) => {
      if (!selected || !caseId.trim()) return;
      setMaterializeConfirmCaseId(null);
      setMaterializingCaseId(caseId);
      setEditError(null);
      setEditNotice(null);
      try {
        const result = await materializeOneRuleCase(selected.serviceCode, caseId, {
          bundle_id: selected.bundleId,
          yaml_text: yamlText.trim() ? yamlText : null,
        });
        await refreshCaseMeta(selected.serviceCode);
        await refreshPoolRows();
        const version = result.testcase.tc_hist_version;
        const versionLabel =
          version != null && version > 0 ? ` (v${version})` : "";
        let msg: string;
        if (result.created) {
          msg = `${caseId}을(를) 풀에 올렸습니다.${versionLabel}`;
        } else if (result.version_bumped) {
          msg = `${caseId}을(를) 풀에 반영했습니다.${versionLabel}`;
        } else {
          msg = `${caseId}: 변경 사항이 없어 버전을 유지했습니다.${versionLabel}`;
        }
        if (result.created || result.version_bumped) {
          toast.success(msg);
        } else {
          toast.message(msg);
        }
        setEditNotice(msg);
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? e.message
            : "케이스 풀 반영에 실패했습니다.";
        setEditError(msg);
        toast.error(msg);
      } finally {
        setMaterializingCaseId(null);
      }
    },
    [selected, yamlText, refreshCaseMeta, refreshPoolRows],
  );

  const requestMaterializeOneCase = useCallback((caseId: string) => {
    if (!caseId.trim()) return;
    setMaterializeConfirmCaseId(caseId.trim());
  }, []);

  const closePanel = () => {
    clearRulesMetaResume();
    setSelected(null);
    setYamlText("");
    setBaselineYamlText("");
    setCaseMeta([]);
    setTogglingCaseId(null);
    setMaterializingCaseId(null);
    setMaterializeConfirmCaseId(null);
    setLastSavedAt(null);
    setEditError(null);
    setEditNotice(null);
    setActivateConfirmOpen(false);
    setCloseConfirmOpen(false);
    setYamlCopyDone(false);
    setYamlRuleFocusEdit(false);
    setRunSession(null);
    setRunningCaseId(null);
  };

  const hasUnsavedChanges =
    !!selected && yamlText.trimEnd() !== baselineYamlText.trimEnd();

  const caseMetaById = useMemo(
    () =>
      Object.fromEntries(
        caseMeta.map((item) => [item.case_id, item] as const),
      ),
    [caseMeta],
  );

  const syncEditorCases = useCallback((editor: ServiceRuleEditorCasesDto) => {
    setYamlText(editor.yaml_text);
    setBaselineYamlText(editor.yaml_text);
    setCaseMeta(editor.case_meta ?? []);
    setSelected((prev) =>
      prev
        ? {
            ...prev,
            bundleId: editor.bundle_id,
            bundleVersion: editor.is_active ? 1 : 0,
            status: editor.status,
            rules: editor.rules.length,
            sourceVersion: editor.source_version ?? "—",
            hasDraft: editor.has_draft,
            isActive: editor.is_active,
          }
        : prev,
    );
  }, []);

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
      await refreshCaseMeta(selected.serviceCode);
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
        { autoMaterializeMissing: true },
      );
      const items = await reloadRegistry();
      const notice =
        bulkActivatePreview.missingTcCount > 0
          ? `작업본 ${bulkActivatePreview.draftCount}건을 확정했습니다. 테스트케이스 ${bulkActivatePreview.missingTcCount}건을 자동 생성했습니다.`
          : "모든 작업본 규칙 케이스가 확정되었습니다. 시나리오에서 참조할 수 있습니다.";
      applySavedBundle(bundle, notice, items);
      await refreshCaseMeta(selected.serviceCode);
      await refreshPoolRows();
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "적용에 실패했습니다.",
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleCaseApplied = async (caseId: string) => {
    if (!selected) return;
    const meta = caseMetaById[caseId];
    if (!meta) return;

    if (!meta.is_applied) {
      if (hasUnsavedChanges) {
        setEditError("확정하려면 먼저 저장하세요.");
        return;
      }
      if (!meta.has_draft) {
        setEditError("확정하려면 먼저 저장하세요.");
        return;
      }
      if (!meta.has_pool_testcase) {
        setEditError(
          "확정하려면 먼저 케이스 옆 올리기 또는 TC 풀·실행 탭 「풀에 반영」을 하세요.",
        );
        return;
      }
    }

    setTogglingCaseId(caseId);
    setEditError(null);
    setEditNotice(null);
    try {
      const editor = meta.is_applied
        ? await deactivateServiceRuleCase(selected.serviceCode, caseId)
        : await applyServiceRuleCase(selected.serviceCode, caseId);
      syncEditorCases(editor);
      const items = await reloadRegistry();
      const row = items?.find((r) => r.serviceCode === selected.serviceCode);
      if (row) {
        setSelected((prev) => (prev ? { ...prev, ...row } : prev));
      }
      setEditNotice(
        meta.is_applied
          ? `${caseId} 규칙 케이스 확정이 해제되었습니다.`
          : `${caseId} 규칙 케이스가 확정되었습니다.`,
      );
    } catch (e) {
      setEditError(
        e instanceof ApiError ? e.message : "케이스 확정 상태 변경에 실패했습니다.",
      );
    } finally {
      setTogglingCaseId(null);
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
  };

  const closeYamlAi = (open: boolean) => {
    if (open) return;
    setYamlAiOpen(false);
    resetYamlAiForm();
  };

  const openYamlAiDialog = () => {
    setYamlAiService("");
    setYamlAiPickerKey((k) => k + 1);
    setYamlAiOpen(true);
    setYamlAiError(null);
  };

  const yamlAiSourceLen = yamlAiSource.trim().length;
  const yamlAiSourceReady = yamlAiSourceLen >= YAML_AI_MIN_SOURCE_LENGTH;

  const selectedStatus = (selected?.status || "draft").toLowerCase();
  const hasWorkingDraft = Boolean(selected?.hasDraft) || selectedStatus === "draft";
  const canApply = hasWorkingDraft && !hasUnsavedChanges;

  const bulkActivatePreview = useMemo(() => {
    const draftCases = caseMeta.filter((item) => item.has_draft);
    const missingTcCases = draftCases.filter((item) => !item.has_pool_testcase);
    return {
      draftCount: draftCases.length,
      missingTcCount: missingTcCases.length,
      missingTcIds: missingTcCases.map((item) => item.case_id),
    };
  }, [caseMeta]);

  return (
    <PageShell
      icon={<Layers className="w-5 h-5" strokeWidth={2} />}
      title="YAML 규칙"
      bodyClassName="overflow-hidden flex flex-col pt-3"
      actions={
        yamlAiJobs.length > 0 ? (
          <YamlAiJobBanner />
        ) : undefined
      }
    >

        <div className="flex flex-col gap-3 flex-1 min-h-0">

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 shrink-0">
          {registryError ? (
            <div className="mb-2 rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 flex flex-wrap items-center justify-between gap-2">
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

          <div className="flex flex-nowrap items-center gap-2 min-w-0">
            <div className="relative flex-1 min-w-[8rem] max-w-[18rem]">
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

            <FinixUnderlineSelect
              aria-label="정렬"
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setPage(1);
              }}
              className="h-9 w-[9.5rem] shrink-0 py-1.5 text-xs bg-card"
            >
              <option value="code_asc">정렬 · 코드</option>
              <option value="updated_desc">정렬 · 최신</option>
              <option value="name_asc">정렬 · 이름</option>
              <option value="rules_desc">정렬 · 규칙수</option>
            </FinixUnderlineSelect>

            <FinixUnderlineSelect
              aria-label="상태"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(1);
              }}
              className="h-9 w-[7rem] shrink-0 py-1.5 text-xs bg-card"
            >
              <option value="">상태 · 전체</option>
              <option value="active">상태 · 적용됨</option>
              <option value="draft">상태 · 작업 중</option>
            </FinixUnderlineSelect>

            <FinixUnderlineSelect
              aria-label="소스 버전"
              value={versionFilter}
              onChange={(e) => {
                setVersionFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-[8.5rem] shrink-0 py-1.5 text-xs bg-card"
            >
              <option value="">버전 · 전체</option>
              {uniqueVersions.map((v) => (
                <option key={v} value={v}>
                  버전 · {v}
                </option>
              ))}
            </FinixUnderlineSelect>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <FinixPrimaryButton
                type="button"
                className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5 shrink-0"
                onClick={openYamlAiDialog}
              >
                <Sparkles className="w-3.5 h-3.5" />
                소스에서 YAML 생성
              </FinixPrimaryButton>
              <button
                type="button"
                className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5 shrink-0 inline-flex items-center border border-border bg-background hover:bg-muted"
                onClick={() => setPostmanImportOpen(true)}
              >
                <FileDown className="w-3.5 h-3.5" />
                Postman에서 가져오기
              </button>
              <button
                type="button"
                title="목록 새로고침"
                aria-label="목록 새로고침"
                disabled={registryLoading}
                onClick={() => void reloadRegistry()}
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <RotateCw
                  className={`w-4 h-4 ${registryLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
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
                  <FinixDataTable className="table-fixed">
                    <FinixDataTableHeader>
                      <FinixDataTableRow className="hover:bg-transparent">
                        <FinixDataTableHead className="w-[110px] whitespace-nowrap">
                          코드
                        </FinixDataTableHead>
                        <FinixDataTableHead className="min-w-[160px]">
                          서비스명
                        </FinixDataTableHead>
                        <FinixDataTableHead className="w-[104px]">
                          상태
                        </FinixDataTableHead>
                        <FinixDataTableHead className="w-[72px] text-right">
                          규칙
                        </FinixDataTableHead>
                        <FinixDataTableHead className="w-[168px] whitespace-nowrap">
                          수정
                        </FinixDataTableHead>
                        <FinixDataTableHead className="w-[110px] whitespace-nowrap">
                          수정자
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
                            colSpan={7}
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
                            colSpan={7}
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
                              className="font-mono text-sm font-medium truncate"
                              title={
                                registryVersionHint(item) ??
                                `편집 대상 #${item.bundleId}`
                              }
                            >
                              {item.serviceCode}
                            </FinixDataTableCell>
                            <FinixDataTableCell
                              className="text-sm truncate"
                              title={item.serviceName}
                            >
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
                            <FinixDataTableCell className="text-sm text-muted-foreground tabular-nums truncate">
                              {item.lastUpdatedAt}
                            </FinixDataTableCell>
                            <FinixDataTableCell
                              className="text-sm text-muted-foreground truncate"
                              title={item.lastUpdatedBy}
                            >
                              {item.lastUpdatedBy}
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

      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) requestClosePanel();
        }}
      >
        <SheetContent
          side="right"
          className={FINIX_STANDARD_SHEET_CONTENT}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {selected && (
            <>
              <SheetHeader
                className={cn(
                  "px-6 border-b border-border shrink-0 text-left",
                  yamlRuleFocusEdit ? "pt-4 pb-3" : "pt-5 pb-4",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 pr-10">
                  <SheetTitle
                    className={cn(
                      "leading-snug font-semibold",
                      yamlRuleFocusEdit ? "text-base" : "text-lg",
                    )}
                  >
                    {selected.serviceName}
                  </SheetTitle>
                  <span className="font-mono text-sm text-muted-foreground">
                    {selected.serviceCode}
                  </span>
                  <StatusPill status={selected.status} />
                </div>
              </SheetHeader>

              {!yamlRuleFocusEdit ? (
              <div className="px-6 pt-1 shrink-0">
                <div className="flex gap-1 border-b border-border">
                  {(
                    [
                      { id: "yaml" as const, label: "케이스 편집" },
                      { id: "testcases" as const, label: "TC 풀·실행" },
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
                    runningSingleId={runningCaseId}
                    onRowsChange={handlePoolRowsChange}
                    registerRefresh={registerPoolRefresh}
                    onRunSessionChange={setRunSession}
                  />
                ) : (
                  <YamlRulesEditPanel
                    serviceCode={selected.serviceCode}
                    yamlText={yamlText}
                    onYamlChange={setYamlText}
                    disabled={editLoading || editSaving}
                    yamlCopyDone={yamlCopyDone}
                    onCopy={() => void copyYamlToClipboard()}
                    onExport={exportYaml}
                    onNotice={setEditNotice}
                    onError={setEditError}
                    onFocusEditChange={setYamlRuleFocusEdit}
                    runningCaseId={runningCaseId}
                    onRunCase={openEditorCaseRun}
                    caseMetaById={caseMetaById}
                    applyNeedsSave={hasUnsavedChanges}
                    materializingCaseId={materializingCaseId}
                    onMaterializeCase={requestMaterializeOneCase}
                    togglingCaseId={togglingCaseId}
                    onToggleCaseApplied={(caseId) => void handleToggleCaseApplied(caseId)}
                  />
                )}
              </div>

              {selected ? (
                <RulesMetaTestCaseRunDialog
                  serviceCode={selected.serviceCode}
                  resumeBundleId={selected.bundleId}
                  yamlText={yamlText}
                  poolRows={poolRows}
                  session={runSession}
                  onSessionChange={setRunSession}
                  onRunningChange={handleRunRunningChange}
                  onPoolRowsRefresh={refreshPoolRows}
                />
              ) : null}

              {!yamlRuleFocusEdit ? (
              <SheetFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-row flex-wrap justify-end gap-2">
                <RulesMetaFooterMessage
                  message={editNotice}
                  className="text-emerald-700 dark:text-emerald-300"
                  autoDismissMs={EDIT_NOTICE_DISMISS_MS}
                  onDismiss={() => setEditNotice(null)}
                />
                <RulesMetaFooterMessage
                  message={editError}
                  className="text-destructive"
                />
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
                          "작업본으로 저장합니다. ▶ 는 시험 실행만 하며 풀·버전은 바꾸지 않습니다."
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
                        <RulesMetaHintButton hint="작업중인 모든 규칙 케이스를 한 번에 공식(확정)으로 올립니다. 개별 케이스는 재생(▶) 옆 버튼으로 켜고 끌 수 있습니다.">
                          <button
                            type="button"
                            className={SECONDARY_BTN_CLASS}
                            disabled={applyDisabled}
                            onClick={() => setActivateConfirmOpen(true)}
                          >
                            전체 확정
                          </button>
                        </RulesMetaHintButton>
                      ) : null}
                    </>
                  );
                })()}
              </SheetFooter>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={materializeConfirmCaseId != null}
        onOpenChange={(open) => {
          if (!open && !materializingCaseId) {
            setMaterializeConfirmCaseId(null);
          }
        }}
      >
        <AlertDialogContent className="z-[110] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>이 케이스를 풀에 반영할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block font-mono text-xs text-foreground">
                {materializeConfirmCaseId}
              </span>
              <span className="block text-xs">
                현재 편집 중인 YAML 기준으로 이 케이스만 풀에 올리고 버전이
                갱신됩니다. 다른 케이스는 그대로 둡니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={Boolean(materializingCaseId)}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={Boolean(materializingCaseId)}
              onClick={() => {
                if (materializeConfirmCaseId) {
                  void handleMaterializeOneCase(materializeConfirmCaseId);
                }
              }}
            >
              풀에 반영
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogTitle>작업본을 전체 확정할까요?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              {selected ? (
                <>
                  <span className="block">
                    <span className="font-mono font-medium text-foreground">
                      {selected.serviceCode}
                    </span>
                  </span>
                  <span className="block text-xs">
                    저장된 작업본{" "}
                    <span className="font-medium text-foreground">
                      {bulkActivatePreview.draftCount}건
                    </span>
                    을 공식(applied)으로 올립니다.
                  </span>
                  {bulkActivatePreview.missingTcCount > 0 ? (
                    <span className="block text-xs">
                      테스트케이스가 없는{" "}
                      <span className="font-medium text-foreground">
                        {bulkActivatePreview.missingTcCount}건
                      </span>
                      은 풀에 자동 생성한 뒤 확정합니다.
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground break-all">
                        {bulkActivatePreview.missingTcIds.join(", ")}
                      </span>
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    일부만 확정하려면 케이스 목록 ▶ 옆 확정 버튼을 사용하세요.
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
              전체 확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={yamlAiOpen} onOpenChange={closeYamlAi}>
        <SheetContent
          side="right"
          className={FINIX_STANDARD_SHEET_WITH_RAIL_CONTENT}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            focusYamlAiServiceSearch();
          }}
        >
          <SheetHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-lg font-semibold leading-snug">
              소스에서 YAML 생성
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {yamlAiError || yamlAiCatalogError ? (
              <div className="shrink-0 mx-6 mt-4 rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
                {yamlAiError ?? yamlAiCatalogError}
              </div>
            ) : null}

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              <aside className="shrink-0 lg:w-[min(24rem,100%)] px-6 py-4 space-y-4 border-b lg:border-b-0 lg:border-r border-border overflow-hidden">
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

                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-3">
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
                    rows={3}
                    className="min-h-[4.5rem]"
                  />
                </FinixField>
              </aside>

              <div className="flex-1 min-h-0 min-w-0 flex flex-col px-6 py-4 overflow-hidden">
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="text-xs text-muted-foreground shrink-0">
                    소스 코드
                  </div>
                  <div className="flex-1 min-h-0 mt-2 relative rounded-sm border border-border bg-background overflow-hidden">
                    <FinixUnderlineTextarea
                      value={yamlAiSource}
                      onChange={(e) => setYamlAiSource(e.target.value)}
                      spellCheck={false}
                      className="absolute inset-0 w-full h-full overflow-y-auto resize-none border-0 px-3 py-2 font-mono text-[12px] leading-relaxed focus:border-0"
                      placeholder="여기에 관련 소스를 붙여넣으세요…"
                    />
                  </div>
                  <div className="mt-1.5 shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      Java/Kotlin/Spring 등 백엔드 소스. 최대 약 12만 자.
                    </p>
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
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-row flex-wrap justify-end gap-2">
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
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
