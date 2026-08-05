import { useScenarioBindingSuggestions } from "@/hooks/useScenarioBindingSuggestions";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import {
    FINIX_LARGE_MODAL_CONTENT,
    FINIX_LARGE_MODAL_MAX_WIDTH,
} from "@/lib/finixModalLayout";
import {
    defaultCollectionPostmanZipName,
    defaultSinglePostmanDownloadName,
    mergeExportPostmanConfig,
    pickInitialExportBaseUrl,
} from "@/lib/postmanExportDownload";
import {
    canExportRegistryScenarioPostman,
    registryScenarioPostmanExportBlockReason,
    exportRegistryCollectionPostmanZip,
    exportRegistryScenarioPostman,
} from "@/lib/registryScenarioExport";
import {
    canRunRegistryScenario,
    focusStepsFromRegistryItem,
    runRegistryCollectionScenarios,
    runRegistryScenario,
    type ScenarioRunMode,
    type ScenarioRunProgressState,
} from "@/lib/registryScenarioRun";
import { persistRegistryScenarioToDb } from "@/lib/registryScenarioPersist";
import { preparePicksForLiveRun } from "@/lib/preparePicksForLiveRun";
import {
    migrateBindingsToStepKeys,
    type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import {
    clearAllScenarioBindings,
    countBindingStats,
} from "@/lib/scenarioBindingClear";
import { resolveScenarioCaseType } from "@/lib/scenarioCaseTypeFilter";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import {
  buildExecutionBatchPath,
} from "@/lib/executionBatchView";
import {
  ensurePostmanConfig,
  emptyPostmanConfig,
  startVarKeysFromConfig,
} from "@/lib/scenarioPostmanVariables";
import {
  mergeWithExecutionDefaults,
  saveExecutionPostmanDefaults,
} from "@/lib/executionPostmanDefaults";
import {
    buildRunStepsFromPicks,
    serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import { pruneOrphanInjects } from "@/lib/scenarioRuntimeContext";
import {
    ChevronLeft,
    ChevronRight,
    Download,
    FolderKanban,
    FolderPlus,
    Link2Off,
    PanelRightClose,
    PanelRightOpen,
    Play,
    Plus,
    Search,
    Sparkles,
    Upload,
    Variable
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { listTestCasesByServiceCode } from "../../api/testcaseApi";
import type { TestCaseReadDto } from "../../api/types";
import { parseMaterializedTestcaseName } from "../../lib/materializedTestcaseName";
import {
  fingerprintRequestBody,
  hydratePickFingerprints,
  anyPickBlocksRun,
  evaluatePickLiveHealth,
  rebindPicksToLivePool,
  acknowledgePickFingerprint,
  type PoolCaseLiveHealth,
} from "@/lib/poolCaseLiveRef";
import { useAuthStore } from "../auth/authStore";
import { PageShell } from "./PageShell";
import { ScenarioAiSuggestionsPanel } from "./scenario/ScenarioAiSuggestionsPanel";
import { ScenarioCollectionVarsDialog } from "./scenario/ScenarioCollectionVarsDialog";
import { ScenarioConnectionWizardStep } from "./scenario/ScenarioConnectionWizardStep";
import { ScenarioPostmanExportDialogForm } from "./scenario/ScenarioPostmanExportDialogForm";
import { ScenarioRunDialogForm } from "./scenario/ScenarioRunDialogForm";
import { ScenarioRunFocusProgress } from "./scenario/ScenarioRunFocusProgress";
import type { ScenarioStepPostmanPanelHandle } from "./scenario/ScenarioStepPostmanPanel";
import { FolderDeleteAlertDialog } from "./scenarioRegistry/components/FolderDeleteAlertDialog";
import { FolderTreeList } from "./scenarioRegistry/components/FolderTreeList";
import { ScenarioListTable } from "./scenarioRegistry/components/ScenarioListTable";
import { ScenarioPreviewPanel } from "./scenarioRegistry/components/ScenarioPreviewPanel";
import { ScenarioTestcaseTransfer } from "./scenarioRegistry/components/ScenarioTestcaseTransfer";
import { ServiceRow } from "./scenarioRegistry/components/ServiceRow";
import { canConfirmFolderDelete } from "./scenarioRegistry/folderDeleteConfirm";
import { firstFolderIdInDisplayOrder } from "./scenarioRegistry/folderModel";
import { loadRegistryState, persistRegistryState } from "./scenarioRegistry/storage";
import {
  loadRegistryUiSession,
  saveRegistryUiSession,
} from "./scenarioRegistry/registryUiSession";
import {
  repairRegistryFolderLinks,
} from "./scenarioRegistry/registryFolderSync";
import type {
    ScenarioRegistryFolder,
    ScenarioRegistryItem,
    ScenarioRegistryStateV2,
    ScenarioRuleTestcaseRef,
    ScenarioSaveStatus,
    ServiceCatalogItem,
    ServiceDraft,
} from "./scenarioRegistry/types";
import {
    getFolderLabel,
    newId,
    nowStamp,
    safeJsonParse,
} from "./scenarioRegistry/utils";
import {
  buildScenarioRegistryItem,
  resolveScenarioSaveStatus,
} from "./scenarioRegistry/wizardPersist";
import {
  createScenarioPickInstance,
  scenarioPickSourceKey,
} from "@/lib/scenarioPickInstance";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
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
import { FinixPrimaryButton } from "./ui/finix-button";
import {
    FinixField,
    FinixUnderlineInput,
    FinixUnderlineSelect,
    FinixUnderlineTextarea,
} from "./ui/finix-form";
import { FinixLoading } from "./ui/finix-loading";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "./ui/resizable";

function mapPersistedTestcaseToRef(
  row: TestCaseReadDto,
  serviceCode: string,
  serviceName: string,
): ScenarioRuleTestcaseRef {
  const parsed = parseMaterializedTestcaseName(row.name, serviceCode);
  return {
    id: `tc-${row.id}`,
    serviceCode,
    serviceName,
    ruleId: row.case_id?.trim() || parsed.ruleId,
    ruleType: parsed.ruleType,
    title: row.name,
    description: parsed.shortLabel,
    backendTestcaseId: row.id,
    scenarioId: row.scenario_id,
    pinnedFingerprint: fingerprintRequestBody(row.request_body),
  };
}

export function ScenarioRegistry() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const updatedBy = user?.username ?? "unknown";

  const [folders, setFolders] = useState<ScenarioRegistryFolder[]>([]);
  const [items, setItems] = useState<ScenarioRegistryItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(true);

  // form state
  const [title, setTitle] = useState("");
  const [servicePickerCode, setServicePickerCode] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([]);
  const [activeServiceCode, setActiveServiceCode] = useState<string | null>(null);
  const [scenarioWizardStep, setScenarioWizardStep] = useState<1 | 2 | 3>(1);
  const [rulePickLoading, setRulePickLoading] = useState(false);
  const [allYamlRuleRefs, setAllYamlRuleRefs] = useState<ScenarioRuleTestcaseRef[]>(
    [],
  );
  const [selectedRulePicks, setSelectedRulePicks] = useState<
    ScenarioRuleTestcaseRef[]
  >([]);
  const [stepBindingsByStepKey, setStepBindingsByStepKey] =
    useState<StepBindingsByStepKey>({});
  const [postmanConfig, setPostmanConfig] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [hydrated, setHydrated] = useState(false);

  const {
    options: catalogOptions,
    loading: catalogLoading,
    error: catalogError,
  } = useServiceCatalogPicker({ enabled: open });

  const scenarioServiceInputRef = useRef<HTMLInputElement>(null);
  const bodyFlushRef = useRef<ScenarioStepPostmanPanelHandle | null>(null);

  const focusScenarioServiceSearch = useCallback(() => {
    window.setTimeout(() => {
      scenarioServiceInputRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!open || scenarioWizardStep !== 1) return;
    focusScenarioServiceSearch();
  }, [
    open,
    scenarioWizardStep,
    catalogLoading,
    focusScenarioServiceSearch,
  ]);

  const [ioDialog, setIoDialog] = useState<"export" | "import" | null>(null);
  const [ioText, setIoText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<
    string | null
  >(null);
  const [folderDeleteConfirmText, setFolderDeleteConfirmText] = useState("");
  const [confirmDeleteScenarioId, setConfirmDeleteScenarioId] = useState<
    string | null
  >(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [postmanExportTarget, setPostmanExportTarget] =
    useState<ScenarioRegistryItem | null>(null);
  const [postmanExportDraft, setPostmanExportDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [postmanExportFilename, setPostmanExportFilename] = useState("");
  const [postmanExportLoading, setPostmanExportLoading] = useState(false);
  const [postmanExportError, setPostmanExportError] = useState<string | null>(
    null,
  );
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false);
  const [clearBindingsOpen, setClearBindingsOpen] = useState(false);
  const [collectionVarsOpen, setCollectionVarsOpen] = useState(false);
  const [collectionExportOpen, setCollectionExportOpen] = useState(false);
  const [collectionExportPostmanDraft, setCollectionExportPostmanDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [collectionExportFilename, setCollectionExportFilename] = useState("");
  const [collectionExportLoading, setCollectionExportLoading] = useState(false);
  const [collectionExportError, setCollectionExportError] = useState<string | null>(
    null,
  );
  const [collectionExportProgress, setCollectionExportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [scenarioRunTarget, setScenarioRunTarget] =
    useState<ScenarioRegistryItem | null>(null);
  const [scenarioRunDraft, setScenarioRunDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [scenarioRunMode, setScenarioRunMode] = useState<ScenarioRunMode>("live");
  const [scenarioRunLoading, setScenarioRunLoading] = useState(false);
  const [scenarioRunError, setScenarioRunError] = useState<string | null>(null);
  const [scenarioRunHeaderOpen, setScenarioRunHeaderOpen] = useState(false);
  const [scenarioRunFocus, setScenarioRunFocus] =
    useState<ScenarioRunProgressState | null>(null);
  const [collectionRunOpen, setCollectionRunOpen] = useState(false);
  const [collectionRunDraft, setCollectionRunDraft] =
    useState<ScenarioPostmanConfig>(emptyPostmanConfig);
  const [collectionRunMode, setCollectionRunMode] = useState<ScenarioRunMode>("live");
  const [collectionRunLoading, setCollectionRunLoading] = useState(false);
  const [collectionRunError, setCollectionRunError] = useState<string | null>(null);
  const [collectionRunHeaderOpen, setCollectionRunHeaderOpen] = useState(false);
  const [collectionRunProgress, setCollectionRunProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const wizardRunSteps = useMemo(
    () =>
      buildRunStepsFromPicks(
        selectedRulePicks,
        serviceNameMapFromDrafts(
          serviceDrafts.map((s) => ({ code: s.code, name: s.name })),
        ),
      ),
    [selectedRulePicks, serviceDrafts],
  );

  const pickHealthById = useMemo(() => {
    const out: Record<string, PoolCaseLiveHealth> = {};
    for (const pick of selectedRulePicks) {
      out[pick.id] = evaluatePickLiveHealth(pick, allYamlRuleRefs);
    }
    return out;
  }, [selectedRulePicks, allYamlRuleRefs]);

  const acknowledgeSelectedPick = (id: string) => {
    setSelectedRulePicks((prev) =>
      prev.map((p) =>
        p.id === id ? acknowledgePickFingerprint(p, allYamlRuleRefs) : p,
      ),
    );
  };

  const wizardBindingStats = useMemo(
    () => countBindingStats(wizardRunSteps, stepBindingsByStepKey),
    [wizardRunSteps, stepBindingsByStepKey],
  );
  const hasWizardBindingsToClear =
    wizardBindingStats.extractCount + wizardBindingStats.injectCount > 0;

  const handlePostmanConfigChange = useCallback(
    (next: ScenarioPostmanConfig) => {
      setPostmanConfig(next);
      const keys = startVarKeysFromConfig(next);
      setStepBindingsByStepKey((prev) =>
        pruneOrphanInjects(wizardRunSteps, prev, keys),
      );
    },
    [wizardRunSteps],
  );

  const aiBindingSuggestions = useScenarioBindingSuggestions(
    wizardRunSteps,
    stepBindingsByStepKey,
    setStepBindingsByStepKey,
  );

  useEffect(() => {
    if (scenarioWizardStep !== 2) {
      setAiSuggestOpen(false);
      setCollectionVarsOpen(false);
    }
  }, [scenarioWizardStep]);

  const selectedScenario = useMemo(() => {
    if (!selectedScenarioId) return null;
    return items.find((x) => x.id === selectedScenarioId) ?? null;
  }, [items, selectedScenarioId]);

  const togglePreviewFor = (id: string) => {
    setSelectedScenarioId((prev) => {
      const isSame = prev === id;
      setPreviewCollapsed((collapsed) => {
        if (!isSame) return false; // new selection -> open
        return !collapsed; // same selection -> toggle
      });
      return id;
    });
  };

  useEffect(() => {
    const loaded = loadRegistryState(updatedBy);
    const uiSession = loadRegistryUiSession();
    const preferredFolderId =
      uiSession?.selectedFolderId ?? loaded.selectedFolderId;
    const repaired = repairRegistryFolderLinks(
      loaded.folders,
      loaded.scenarios,
      preferredFolderId,
    );
    setFolders(loaded.folders);
    setItems(repaired.scenarios);
    setSelectedFolderId(repaired.selectedFolderId);
    if (uiSession) {
      setQuery(uiSession.query);
      setTagFilter(uiSession.tagFilter);
      setPreviewCollapsed(uiSession.previewCollapsed);
      const scenarioStillExists = repaired.scenarios.some(
        (s) => s.id === uiSession.selectedScenarioId,
      );
      if (
        scenarioStillExists &&
        uiSession.selectedScenarioId &&
        (!repaired.selectedFolderId ||
          repaired.scenarios.find((s) => s.id === uiSession.selectedScenarioId)
            ?.folderId === repaired.selectedFolderId)
      ) {
        setSelectedScenarioId(uiSession.selectedScenarioId);
      }
    }
    setHydrated(loaded.hydrated);
  }, [updatedBy]);

  const folderIdsKey = useMemo(
    () => folders.map((folder) => folder.id).join("|"),
    [folders],
  );

  useEffect(() => {
    if (!hydrated) return;
    const repaired = repairRegistryFolderLinks(folders, items, selectedFolderId);
    if (repaired.selectedFolderId !== selectedFolderId) {
      setSelectedFolderId(repaired.selectedFolderId);
    }
    const changed = repaired.scenarios.some(
      (scenario, index) => scenario.folderId !== items[index]?.folderId,
    );
    if (changed) {
      setItems(repaired.scenarios);
    }
    // Repair when collection structure changes (create/delete/import).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, folderIdsKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: ScenarioRegistryStateV2 = {
        version: 2,
        folders,
        scenarios: items,
        selectedFolderId,
      };
      persistRegistryState(payload);
    } catch {
      // ignore
    }
  }, [hydrated, folders, items, selectedFolderId]);

  useEffect(() => {
    if (!hydrated) return;
    saveRegistryUiSession({
      selectedFolderId,
      selectedScenarioId,
      query,
      tagFilter,
      previewCollapsed,
    });
  }, [
    hydrated,
    selectedFolderId,
    selectedScenarioId,
    query,
    tagFilter,
    previewCollapsed,
  ]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.tags.forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (selectedFolderId && i.folderId !== selectedFolderId) return false;
        if (tagFilter && !i.tags.includes(tagFilter)) return false;
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)) ||
          i.updatedBy.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, query, tagFilter, selectedFolderId]);

  const scenarioListEmptyCopy = useMemo(() => {
    if (folders.length === 0) {
      return {
        title: "컬렉션이 없습니다.",
        detail: "왼쪽에서 컬렉션을 만든 뒤 시나리오를 등록할 수 있습니다.",
        canRegister: false,
      };
    }
    if (!selectedFolderId) {
      return {
        title: "컬렉션을 선택해 주세요.",
        detail: "왼쪽 목록에서 컬렉션을 선택하면 시나리오가 표시됩니다.",
        canRegister: false,
      };
    }
    return {
      title: "이 컬렉션에 등록된 시나리오가 없습니다.",
      detail: undefined,
      canRegister: true,
    };
  }, [folders.length, selectedFolderId]);

  const leftRulePool = useMemo(() => {
    let pool = allYamlRuleRefs;
    if (activeServiceCode) {
      pool = pool.filter((r) => r.serviceCode === activeServiceCode);
    }
    return pool;
  }, [allYamlRuleRefs, activeServiceCode]);

  useEffect(() => {
    if (serviceDrafts.length === 0) {
      setActiveServiceCode(null);
      return;
    }
    setActiveServiceCode((current) => {
      if (current && serviceDrafts.some((s) => s.code === current)) return current;
      return serviceDrafts[0]?.code ?? null;
    });
  }, [serviceDrafts]);

  useEffect(() => {
    if (!open || scenarioWizardStep !== 1) return;
    if (serviceDrafts.length === 0) {
      setAllYamlRuleRefs([]);
      setRulePickLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setRulePickLoading(true);
      try {
        const merged: ScenarioRuleTestcaseRef[] = [];
        const seenIds = new Set<number>();
        for (const s of serviceDrafts) {
          try {
            const rows = await listTestCasesByServiceCode(s.code, 500);
            if (cancelled) return;
            const name = s.name || s.code;
            for (const row of rows) {
              if (row.scenario_id != null) continue;
              if (seenIds.has(row.id)) continue;
              seenIds.add(row.id);
              merged.push(mapPersistedTestcaseToRef(row, s.code, name));
            }
          } catch {
            // ignore per-service fetch errors
          }
        }
        if (!cancelled) {
          setAllYamlRuleRefs(merged);
          setSelectedRulePicks((prev) => {
            if (prev.length === 0) return prev;
            const rebound = rebindPicksToLivePool(prev, merged);
            return hydratePickFingerprints(rebound, merged);
          });
        }
      } finally {
        if (!cancelled) setRulePickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scenarioWizardStep, serviceDrafts]);

  const addRuleToSelected = (r: ScenarioRuleTestcaseRef) => {
    setSelectedRulePicks((prev) => [
      ...prev,
      createScenarioPickInstance(r, newId),
    ]);
  };

  const removeRuleFromSelected = (id: string) => {
    setSelectedRulePicks((prev) => prev.filter((x) => x.id !== id));
  };

  const addRulesByCaseType = (caseType: "E" | "N" | "all") => {
    setSelectedRulePicks((prev) => {
      const present = new Set(prev.map((x) => scenarioPickSourceKey(x)));
      const next = [...prev];
      for (const row of leftRulePool) {
        if (caseType !== "all" && resolveScenarioCaseType(row) !== caseType) {
          continue;
        }
        const sourceKey = scenarioPickSourceKey(row);
        if (present.has(sourceKey)) continue;
        present.add(sourceKey);
        next.push(createScenarioPickInstance(row, newId));
      }
      return next;
    });
  };

  const removeAllRulesFromSelected = () => {
    setSelectedRulePicks([]);
  };

  const reorderSelectedRules = (dragIndex: number, hoverIndex: number) => {
    setSelectedRulePicks((prev) => {
      if (
        dragIndex < 0 ||
        hoverIndex < 0 ||
        dragIndex >= prev.length ||
        hoverIndex >= prev.length ||
        dragIndex === hoverIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      if (!item) return prev;
      next.splice(hoverIndex, 0, item);
      return next;
    });
  };

  const selectServiceInSequence = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    if (!serviceDrafts.some((s) => s.code === normalized)) return;
    setActiveServiceCode(normalized);
    setServicePickerCode("");
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleServiceCatalogPick = (code: string) => {
    if (!code) return;
    const opt = catalogOptions.find((o) => o.code === code);
    if (!opt) return;
    if (serviceDrafts.some((p) => p.code === code)) {
      selectServiceInSequence(code);
      return;
    }
    addService({ code: opt.code, name: opt.name });
    setActiveServiceCode(code);
    setServicePickerCode("");
  };

  const parseDragRuleId = (e: DragEvent): string | null => {
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return null;
      const o = JSON.parse(raw) as { id?: string };
      return typeof o.id === "string" ? o.id : null;
    } catch {
      return null;
    }
  };

  const scenariosInSelectedFolder = useMemo(() => {
    if (!selectedFolderId) return [];
    return items.filter((i) => i.folderId === selectedFolderId);
  }, [items, selectedFolderId]);

  const collectionExportStats = useMemo(() => {
    const total = scenariosInSelectedFolder.length;
    const exportable = scenariosInSelectedFolder.filter(
      canExportRegistryScenarioPostman,
    );
    return {
      total,
      exportableCount: exportable.length,
      skippedCount: total - exportable.length,
      exportable,
    };
  }, [scenariosInSelectedFolder]);

  const postmanExportDefaultFilename = useMemo(() => {
    if (!postmanExportTarget) return "postman-scenario.json";
    return defaultSinglePostmanDownloadName(postmanExportTarget.title);
  }, [postmanExportTarget]);

  const folderOptions = useMemo(() => {
    const roots = folders.filter((f) => f.parentId == null);
    const childrenByParent = new Map<string, ScenarioRegistryFolder[]>();
    folders
      .filter((f) => f.parentId != null)
      .forEach((f) => {
        const key = f.parentId as string;
        const arr = childrenByParent.get(key) ?? [];
        arr.push(f);
        childrenByParent.set(key, arr);
      });

    const out: Array<{ id: string; label: string; depth: number }> = [];
    const walk = (f: ScenarioRegistryFolder, depth: number) => {
      out.push({ id: f.id, label: f.name, depth });
      const kids = (childrenByParent.get(f.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      kids.forEach((k) => walk(k, depth + 1));
    };
    roots.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => walk(r, 0));
    return out;
  }, [folders]);

  const collectionExportDefaultFilename = useMemo(() => {
    if (!selectedFolderId) return "postman-collection.zip";
    return defaultCollectionPostmanZipName(
      getFolderLabel(folderOptions, selectedFolderId),
    );
  }, [selectedFolderId, folderOptions]);

  const folderSummary = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    folders.forEach((f) => {
      if (!f.parentId) return;
      const arr = childrenByParent.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenByParent.set(f.parentId, arr);
    });

    const descendantsCache = new Map<string, Set<string>>();
    const descendantsOf = (id: string): Set<string> => {
      const cached = descendantsCache.get(id);
      if (cached) return cached;
      const set = new Set<string>([id]);
      const stack = [...(childrenByParent.get(id) ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (set.has(cur)) continue;
        set.add(cur);
        (childrenByParent.get(cur) ?? []).forEach((kid) => stack.push(kid));
      }
      descendantsCache.set(id, set);
      return set;
    };

    const byId = new Map<string, { count: number }>();

    folders.forEach((f) => {
      const set = descendantsOf(f.id);
      const count = items.filter((s) => set.has(s.folderId)).length;
      byId.set(f.id, { count });
    });
    return byId;
  }, [folders, items]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setServicePickerCode("");
    setDescription("");
    setTagsText("");
    setFolderId(selectedFolderId ?? firstFolderIdInDisplayOrder(folders) ?? "");
    setServiceDrafts([]);
    setActiveServiceCode(null);
    setScenarioWizardStep(1);
    setRulePickLoading(false);
    setAllYamlRuleRefs([]);
    setSelectedRulePicks([]);
    setStepBindingsByStepKey({});
    setPostmanConfig(emptyPostmanConfig());
    setError(null);
  };

  const startCreate = () => {
    if (folders.length === 0) {
      setError("시나리오를 등록하려면 컬렉션을 먼저 만드세요.");
      return;
    }
    resetForm();
    setOpen(true);
  };

  const startEdit = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditingId(id);
    setTitle(item.title);
    setServicePickerCode("");
    setDescription(item.description);
    setTagsText(item.tags.join(", "));
    setFolderId(item.folderId);
    const drafts = (item.serviceSequence ?? []).map((s) => ({
      id: newId(),
      code: s.code,
      name: s.name,
    }));
    setServiceDrafts(drafts);
    setActiveServiceCode(drafts[0]?.code ?? null);
    const picks =
      item.selectedRuleTestcases?.length
        ? [...item.selectedRuleTestcases]
        : [];
    setSelectedRulePicks(picks);
    setStepBindingsByStepKey(
      migrateBindingsToStepKeys(
        picks.map((p) => p.id),
        picks,
        item.stepBindingsByStepKey ?? item.stepBindingsByCode,
      ),
    );
    setPostmanConfig(ensurePostmanConfig(item.postmanConfig));
    const resumeStep =
      resolveScenarioSaveStatus(item) === "draft" && item.wizardStep
        ? item.wizardStep
        : 1;
    setScenarioWizardStep(resumeStep);
    setError(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const picks = selectedRulePicks;
    setStepBindingsByStepKey((prev) =>
      migrateBindingsToStepKeys(
        picks.map((p) => p.id),
        picks,
        prev,
      ),
    );
  }, [open, selectedRulePicks]);

  const persistWizard = async (mode: ScenarioSaveStatus) => {
    if (wizardSaving) return;
    const flushed = bodyFlushRef.current?.flush();
    if (flushed && !flushed.ok) {
      // Invalid JSON is already shown on the Input panel; avoid footer/page banner.
      setScenarioWizardStep(2);
      return;
    }
    const bindingsForSave = flushed?.bindings ?? stepBindingsByStepKey;

    if (mode === "ready") {
      const liveBlock = anyPickBlocksRun(selectedRulePicks, allYamlRuleRefs);
      if (liveBlock) {
        setError(liveBlock);
        setScenarioWizardStep(1);
        return;
      }
    }

    const existing = editingId
      ? (items.find((i) => i.id === editingId) ?? null)
      : null;
    const result = buildScenarioRegistryItem({
      mode,
      wizardStep: scenarioWizardStep,
      editingId,
      existing,
      title,
      description,
      tagsText,
      folderId,
      selectedFolderId,
      folders,
      serviceDrafts,
      selectedRulePicks,
      stepBindingsByStepKey: bindingsForSave,
      postmanConfig,
      updatedBy,
      newId,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const item = result.item;
    if (flushed?.bindings) {
      setStepBindingsByStepKey(flushed.bindings);
    }

    setWizardSaving(true);
    setError(null);
    try {
      const { scenarioId } = await persistRegistryScenarioToDb({
        title: item.title,
        prompt: item.description?.trim() || item.title,
        serviceSequence: item.serviceSequence,
        stepBindingsByStepKey: item.stepBindingsByStepKey,
        selectedRuleTestcases: item.selectedRuleTestcases,
        postmanConfig: item.postmanConfig,
        existingScenarioId: item.backendScenarioId,
        markSaved: mode === "ready",
      });
      const synced: ScenarioRegistryItem = {
        ...item,
        backendScenarioId: scenarioId,
      };
      setItems((prev) => {
        const idx = prev.findIndex((row) => row.id === synced.id);
        if (idx < 0) return [synced, ...prev];
        return prev.map((row) => (row.id === synced.id ? synced : row));
      });
      // Keep wizard open on draft save; lock editingId so re-saves update the same row.
      if (mode === "draft") {
        setEditingId(synced.id);
        return;
      }
      setSelectedScenarioId(synced.id);
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : mode === "draft"
            ? "임시저장에 실패했습니다. DB 저장이 필요합니다."
            : "완료 저장에 실패했습니다. DB 저장이 필요합니다.",
      );
    } finally {
      setWizardSaving(false);
    }
  };

  const save = () => {
    void persistWizard("ready");
  };
  const saveDraft = () => {
    void persistWizard("draft");
  };

  const openPostmanExportDialog = (item: ScenarioRegistryItem) => {
    const block = registryScenarioPostmanExportBlockReason(item);
    if (block) {
      setError(block);
      return;
    }
    setPostmanExportError(null);
    setPostmanExportDraft(ensurePostmanConfig(item.postmanConfig));
    setPostmanExportFilename("");
    setPostmanExportTarget(item);
  };

  const closePostmanExportDialog = () => {
    if (postmanExportLoading) return;
    setPostmanExportTarget(null);
    setPostmanExportError(null);
  };

  const confirmPostmanExport = async () => {
    const item = postmanExportTarget;
    if (!item || !canExportRegistryScenarioPostman(item)) return;

    setPostmanExportLoading(true);
    setExportingId(item.id);
    setPostmanExportError(null);
    setError(null);
    try {
      const itemWithPostman = {
        ...item,
        postmanConfig: postmanExportDraft,
      };
      const { scenarioId } = await exportRegistryScenarioPostman(itemWithPostman, {
        downloadName: postmanExportFilename,
      });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, backendScenarioId: scenarioId, postmanConfig: postmanExportDraft }
            : row,
        ),
      );
      setPostmanExportTarget(null);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "포스트맨 컬렉션 export에 실패했습니다.";
      setPostmanExportError(message);
      setError(message);
    } finally {
      setPostmanExportLoading(false);
      setExportingId(null);
    }
  };

  const openCollectionExportDialog = () => {
    if (!selectedFolderId) {
      setError("컬렉션을 먼저 선택하세요.");
      return;
    }
    if (collectionExportStats.exportableCount === 0) {
      setError(
        "다운로드할 시나리오가 없습니다. 완료 저장되고 모든 테스트 케이스가 DB에 있는 시나리오만 export할 수 있습니다.",
      );
      return;
    }
    setCollectionExportError(null);
    setCollectionExportProgress(null);
    setCollectionExportPostmanDraft({
      ...emptyPostmanConfig(),
      baseUrl: pickInitialExportBaseUrl(collectionExportStats.exportable),
    });
    setCollectionExportFilename("");
    setCollectionExportOpen(true);
  };

  const closeCollectionExportDialog = () => {
    if (collectionExportLoading) return;
    setCollectionExportOpen(false);
    setCollectionExportError(null);
    setCollectionExportProgress(null);
  };

  const confirmCollectionExport = async () => {
    if (!selectedFolderId) return;
    const folderLabel = getFolderLabel(folderOptions, selectedFolderId);

    setCollectionExportLoading(true);
    setCollectionExportError(null);
    setCollectionExportProgress({
      done: 0,
      total: collectionExportStats.exportableCount,
    });
    setError(null);
    try {
      const result = await exportRegistryCollectionPostmanZip(
        scenariosInSelectedFolder,
        {
          zipDownloadName: collectionExportFilename,
          baseUrlOverride: collectionExportPostmanDraft.baseUrl,
          folderLabel,
        },
        (done, total) => setCollectionExportProgress({ done, total }),
      );
      setItems((prev) =>
        prev.map((row) => {
          const scenarioId = result.scenarioIdsByItemId[row.id];
          if (scenarioId == null) return row;
          return {
            ...row,
            backendScenarioId: scenarioId,
            postmanConfig: mergeExportPostmanConfig(
              row.postmanConfig,
              collectionExportPostmanDraft.baseUrl,
            ),
          };
        }),
      );
      if (result.errors.length > 0) {
        const preview = result.errors.slice(0, 2).join(" · ");
        const suffix = result.errors.length > 2 ? " …" : "";
        setError(
          `ZIP ${result.exported}개 포함. ${result.errors.length}개 실패: ${preview}${suffix}`,
        );
      }
      setCollectionExportOpen(false);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "컬렉션 Postman 다운로드에 실패했습니다.";
      setCollectionExportError(message);
      setError(message);
    } finally {
      setCollectionExportLoading(false);
      setCollectionExportProgress(null);
    }
  };

  const openScenarioRunDialog = async (item: ScenarioRegistryItem) => {
    if (!canRunRegistryScenario(item)) {
      setError(
        registryScenarioPostmanExportBlockReason(item) ??
          "실행하려면 시나리오에 DB 테스트 케이스가 포함되어 있어야 합니다.",
      );
      return;
    }
    const picks = item.selectedRuleTestcases ?? [];
    const prepared = await preparePicksForLiveRun(picks);
    if (prepared.error) {
      setError(prepared.error);
      return;
    }
    const itemForRun = {
      ...item,
      selectedRuleTestcases: prepared.picks,
    };
    setScenarioRunError(null);
    setScenarioRunFocus(null);
    setScenarioRunHeaderOpen(false);
    setScenarioRunDraft(
      mergeWithExecutionDefaults(ensurePostmanConfig(item.postmanConfig)),
    );
    setScenarioRunMode("live");
    setScenarioRunTarget(itemForRun);
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? { ...row, selectedRuleTestcases: prepared.picks }
          : row,
      ),
    );
  };

  const closeScenarioRunDialog = () => {
    if (scenarioRunLoading) return;
    setScenarioRunHeaderOpen(false);
    setScenarioRunTarget(null);
    setScenarioRunError(null);
    setScenarioRunFocus(null);
  };

  const confirmScenarioRun = async () => {
    const item = scenarioRunTarget;
    if (!item || !canRunRegistryScenario(item)) return;
    if (scenarioRunMode === "live" && !scenarioRunDraft.baseUrl.trim()) {
      setScenarioRunError("Live 실행에는 baseUrl이 필요합니다.");
      return;
    }

    setScenarioRunLoading(true);
    setRunningId(item.id);
    setScenarioRunError(null);
    setError(null);
    setScenarioRunFocus({
      steps: focusStepsFromRegistryItem(item),
      currentIndex: 0,
      status: "pending",
      total: Math.max(item.selectedRuleTestcases?.length ?? 0, 1),
    });
    try {
      const itemWithPostman = { ...item, postmanConfig: scenarioRunDraft };
      saveExecutionPostmanDefaults(scenarioRunDraft);
      const { scenarioId, executionId } = await runRegistryScenario({
        item: itemWithPostman,
        postmanConfig: scenarioRunDraft,
        mode: scenarioRunMode,
        onProgress: setScenarioRunFocus,
      });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                backendScenarioId: scenarioId,
                postmanConfig: scenarioRunDraft,
              }
            : row,
        ),
      );
      setScenarioRunTarget(null);
      setScenarioRunFocus(null);
      navigate(`/execution-result/${executionId}`, {
        state: { from: location.pathname },
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "시나리오 실행에 실패했습니다.";
      setScenarioRunError(message);
      setError(message);
    } finally {
      setScenarioRunLoading(false);
      setRunningId(null);
    }
  };

  const openCollectionRunDialog = () => {
    if (!selectedFolderId) {
      setError("컬렉션을 먼저 선택하세요.");
      return;
    }
    if (collectionExportStats.exportableCount === 0) {
      setError(
        "실행할 시나리오가 없습니다. 완료 저장되고 모든 테스트 케이스가 DB에 있는 시나리오만 실행할 수 있습니다.",
      );
      return;
    }
    setCollectionRunError(null);
    setCollectionRunProgress(null);
    setCollectionRunHeaderOpen(false);
    setCollectionRunDraft(
      mergeWithExecutionDefaults({
        ...emptyPostmanConfig(),
        baseUrl: pickInitialExportBaseUrl(collectionExportStats.exportable),
      }),
    );
    setCollectionRunMode("live");
    setCollectionRunOpen(true);
  };

  const closeCollectionRunDialog = () => {
    if (collectionRunLoading) return;
    setCollectionRunHeaderOpen(false);
    setCollectionRunOpen(false);
    setCollectionRunError(null);
    setCollectionRunProgress(null);
  };

  const confirmCollectionRun = async () => {
    if (!selectedFolderId) return;
    if (collectionRunMode === "live" && !collectionRunDraft.baseUrl.trim()) {
      setCollectionRunError("Live 실행에는 baseUrl이 필요합니다.");
      return;
    }

    setCollectionRunLoading(true);
    setCollectionRunError(null);
    setCollectionRunProgress({
      done: 0,
      total: collectionExportStats.exportableCount,
    });
    setError(null);
    try {
      saveExecutionPostmanDefaults(collectionRunDraft);
      const result = await runRegistryCollectionScenarios(
        scenariosInSelectedFolder,
        {
          baseUrlOverride: collectionRunDraft.baseUrl,
          mode: collectionRunMode,
        },
        (done, total) => setCollectionRunProgress({ done, total }),
      );
      setItems((prev) =>
        prev.map((row) => {
          const run = result.runs.find((r) => r.itemId === row.id);
          if (!run) return row;
          return {
            ...row,
            backendScenarioId: run.scenarioId,
            postmanConfig: mergeExportPostmanConfig(
              row.postmanConfig,
              collectionRunDraft.baseUrl,
            ),
          };
        }),
      );
      setCollectionRunOpen(false);
      const collectionName = selectedFolderId
        ? getFolderLabel(folderOptions, selectedFolderId)
        : undefined;
      navigate(
        buildExecutionBatchPath(result.runs.map((r) => r.executionId)),
        {
          state: {
            from: location.pathname,
            batchMeta: {
              runs: result.runs,
              skipped: result.skipped,
              errors: result.errors,
              collectionName,
            },
          },
        },
      );
      if (result.errors.length > 0) {
        const preview = result.errors.slice(0, 2).join(" · ");
        const suffix = result.errors.length > 2 ? " …" : "";
        setError(
          `실행 ${result.runs.length}건 완료. ${result.errors.length}건 실패: ${preview}${suffix}`,
        );
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "컬렉션 실행에 실패했습니다.";
      setCollectionRunError(message);
      setError(message);
    } finally {
      setCollectionRunLoading(false);
      setCollectionRunProgress(null);
    }
  };

  const remove = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setConfirmDeleteScenarioId(id);
  };

  const confirmRemoveScenario = () => {
    if (!confirmDeleteScenarioId) return;
    const id = confirmDeleteScenarioId;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmDeleteScenarioId(null);
  };

  const startCreateFolder = (parentId: string | null) => {
    setFolderEditingId(null);
    setFolderName("");
    setFolderParentId(parentId);
    setFolderDialog(true);
  };

  const startEditFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    setFolderEditingId(id);
    setFolderName(f.name);
    setFolderParentId(f.parentId);
    setFolderDialog(true);
  };

  const saveFolder = () => {
    const name = folderName.trim();
    if (!name) {
      setError("폴더 이름은 필수입니다.");
      return;
    }
    const stamp = nowStamp();
    if (!folderEditingId) {
      const f: ScenarioRegistryFolder = {
        id: newId(),
        name,
        parentId: folderParentId,
        createdAt: stamp,
        updatedAt: stamp,
        updatedBy,
      };
      setFolders((prev) => [f, ...prev]);
      if (!selectedFolderId) setSelectedFolderId(f.id);
      setFolderDialog(false);
      return;
    }
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderEditingId
          ? { ...f, name, parentId: folderParentId, updatedAt: stamp, updatedBy }
          : f,
      ),
    );
    setFolderDialog(false);
  };

  const removeFolder = (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!f) return;

    const hasChildren = folders.some((x) => x.parentId === id);
    if (hasChildren) {
      setError(
        "하위 컬렉션이 있으면 삭제할 수 없습니다. 하위 컬렉션을 먼저 삭제하세요.",
      );
      return;
    }

    setError(null);
    setFolderDeleteConfirmText("");
    setConfirmDeleteFolderId(id);
  };

  const closeFolderDeleteDialog = () => {
    setConfirmDeleteFolderId(null);
    setFolderDeleteConfirmText("");
  };

  const applyDeleteFolder = () => {
    const id = confirmDeleteFolderId;
    if (!id) return;

    const f = folders.find((x) => x.id === id);
    if (!f) {
      closeFolderDeleteDialog();
      return;
    }

    const scenariosInFolder = items.filter((s) => s.folderId === id);
    if (!canConfirmFolderDelete(scenariosInFolder.length, folderDeleteConfirmText)) {
      return;
    }

    setItems((prev) => prev.filter((s) => s.folderId !== id));
    setFolders((prev) => prev.filter((x) => x.id !== id));

    if (selectedFolderId === id) {
      const remaining = folders.filter((x) => x.id !== id);
      setSelectedFolderId(firstFolderIdInDisplayOrder(remaining));
    }

    if (
      selectedScenarioId &&
      scenariosInFolder.some((s) => s.id === selectedScenarioId)
    ) {
      setSelectedScenarioId(null);
    }

    closeFolderDeleteDialog();
    setError(null);
  };

  const folderPendingDelete = useMemo(
    () => folders.find((x) => x.id === confirmDeleteFolderId) ?? null,
    [confirmDeleteFolderId, folders],
  );

  const folderDeleteScenarioCount = useMemo(() => {
    if (!confirmDeleteFolderId) return 0;
    return items.filter((s) => s.folderId === confirmDeleteFolderId).length;
  }, [confirmDeleteFolderId, items]);

  const exportJson = () => {
    const payload: ScenarioRegistryStateV2 = {
      version: 2,
      folders,
      scenarios: items,
      selectedFolderId,
    };
    setIoText(JSON.stringify(payload, null, 2));
    setIoDialog("export");
  };

  const importJson = () => {
    setIoText("");
    setIoDialog("import");
  };

  const applyImport = () => {
    const parsed = safeJsonParse<ScenarioRegistryStateV2>(ioText);
    if (!parsed || parsed.version !== 2) {
      setError("가져오기 JSON 형식이 올바르지 않습니다.");
      return;
    }
    setFolders(parsed.folders ?? []);
    const repaired = repairRegistryFolderLinks(
      parsed.folders ?? [],
      parsed.scenarios ?? [],
      parsed.selectedFolderId ?? parsed.folders?.[0]?.id ?? null,
    );
    setItems(repaired.scenarios);
    setSelectedFolderId(repaired.selectedFolderId);
    setIoDialog(null);
    setError(null);
  };

  const addService = (svc: ServiceCatalogItem) => {
    setServiceDrafts((prev) => {
      if (prev.some((p) => p.code === svc.code)) return prev;
      return [...prev, { id: newId(), code: svc.code, name: svc.name }];
    });
    setActiveServiceCode(svc.code);
    setServicePickerCode("");
  };

  const moveService = (dragIndex: number, hoverIndex: number) => {
    if (dragIndex === hoverIndex) return;
    setServiceDrafts((prev) => {
      if (
        dragIndex < 0 ||
        hoverIndex < 0 ||
        dragIndex >= prev.length ||
        hoverIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      if (!removed) return prev;
      next.splice(hoverIndex, 0, removed);
      return next;
    });
  };

  const removeService = (id: string) => {
    setServiceDrafts((prev) => {
      const removed = prev.find((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      if (removed) {
        setActiveServiceCode((active) =>
          active === removed.code ? (next[0]?.code ?? null) : active,
        );
      }
      return next;
    });
  };

  return (
    <PageShell
      icon={<FolderKanban className="w-5 h-5" strokeWidth={2} />}
      title="시나리오 관리"
      bodyClassName="overflow-hidden flex flex-col pt-3"
    >

        <div className="flex flex-col gap-3 flex-1 min-h-0">

        {error ? (
          <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive shrink-0">
            {error}
          </div>
        ) : null}

        <div className="bg-card border border-border rounded-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-end gap-6 shrink-0">
            <div className="flex flex-wrap items-end gap-6">
              <FinixField label="태그" className="min-w-[12rem]">
                <FinixUnderlineSelect
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">전체</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FinixUnderlineSelect>
              </FinixField>
            </div>

            <div className="relative ml-auto min-w-[min(520px,100%)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <FinixUnderlineInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목/설명/태그/수정자로 검색"
                className="h-10 pl-10 pr-3 bg-card"
              />
            </div>
          </div>

          {/* Mobile (stacked) */}
          <div className="flex-1 min-h-0 md:hidden overflow-hidden flex flex-col">
            <div className="border-t border-border flex flex-col min-h-0 max-h-[38%] shrink-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="text-sm font-medium">컬렉션 목록</div>
                <button
                  type="button"
                  className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="상위 컬렉션 추가"
                  onClick={() => startCreateFolder(null)}
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2 overflow-auto min-h-0 flex-1">
                {folderOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">
                    폴더가 없습니다.
                  </p>
                ) : (
                  <FolderTreeList
                    folderOptions={folderOptions}
                    folderSummary={folderSummary}
                    selectedFolderId={selectedFolderId}
                    setSelectedFolderId={setSelectedFolderId}
                    startCreateFolder={startCreateFolder}
                    startEditFolder={startEditFolder}
                    removeFolder={removeFolder}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-border flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div className="text-sm text-muted-foreground">
                  현재 컬렉션:{" "}
                  <span className="text-foreground font-medium">
                    {selectedFolderId
                      ? getFolderLabel(folderOptions, selectedFolderId)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 px-2.5 rounded-sm border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    onClick={openCollectionRunDialog}
                    disabled={
                      !selectedFolderId || collectionExportStats.exportableCount === 0
                    }
                    title="컬렉션 시나리오 전체 실행"
                  >
                    <Play className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">전체 실행</span>
                  </button>
                  <button
                    type="button"
                    className="h-9 px-2.5 rounded-sm border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    onClick={openCollectionExportDialog}
                    disabled={
                      !selectedFolderId || collectionExportStats.exportableCount === 0
                    }
                    title="컬렉션 시나리오 Postman ZIP 다운로드"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">전체 다운로드</span>
                  </button>
                  <FinixPrimaryButton
                    onClick={startCreate}
                    disabled={folders.length === 0}
                    className="h-9 px-3 w-auto rounded-sm text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    등록
                  </FinixPrimaryButton>
                </div>
              </div>
              <div className="flex flex-col lg:flex-row lg:items-stretch flex-1 min-h-0 overflow-hidden">
                <div
                  className={[
                    "flex-1 min-w-0 overflow-auto",
                    !previewCollapsed
                      ? "lg:w-1/2 lg:max-h-[min(70vh,800px)]"
                      : "w-full",
                  ].join(" ")}
                >
                  <ScenarioListTable
                    items={filtered}
                    selectedScenarioId={selectedScenarioId}
                    previewCollapsed={previewCollapsed}
                    emptyCopy={scenarioListEmptyCopy}
                    actions="history"
                    runningId={runningId}
                    exportingId={exportingId}
                    confirmDeleteScenarioId={confirmDeleteScenarioId}
                    onSelectRow={togglePreviewFor}
                    onRegister={startCreate}
                    onOpenHistory={() => navigate("/history")}
                    onEdit={startEdit}
                    onRun={(item) => void openScenarioRunDialog(item)}
                    onExport={openPostmanExportDialog}
                    onRequestDelete={remove}
                    onConfirmDeleteOpenChange={(v, id) =>
                      setConfirmDeleteScenarioId(v ? id : null)
                    }
                    onConfirmDelete={confirmRemoveScenario}
                    onCancelDelete={() => setConfirmDeleteScenarioId(null)}
                  />
                </div>
                {!previewCollapsed ? (
                  <ScenarioPreviewPanel
                    selectedScenario={selectedScenario}
                    onClose={() => setPreviewCollapsed(true)}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* Desktop (resizable) */}
          <div className="hidden md:block flex-1 min-h-0 h-full overflow-hidden">
            <ResizablePanelGroup
              direction="horizontal"
              className="h-full items-stretch"
            >
              <ResizablePanel defaultSize={18} minSize={14} maxSize={28}>
                <div className="h-full border-t border-border flex flex-col min-h-0">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-medium">컬렉션 목록</div>
                    <button
                      type="button"
                      className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                      title="상위 컬렉션 추가"
                      onClick={() => startCreateFolder(null)}
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2 overflow-auto flex-1 min-h-0">
                    {folderOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3">
                        폴더가 없습니다.
                      </p>
                    ) : (
                      <FolderTreeList
                        folderOptions={folderOptions}
                        folderSummary={folderSummary}
                        selectedFolderId={selectedFolderId}
                        setSelectedFolderId={setSelectedFolderId}
                        startCreateFolder={startCreateFolder}
                        startEditFolder={startEditFolder}
                        removeFolder={removeFolder}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle className="w-px bg-border hover:bg-muted-foreground/35 self-stretch h-full z-10 cursor-col-resize after:w-1.5" />
              <ResizablePanel defaultSize={82} minSize={50}>
                <div className="h-full border-t border-border flex flex-col min-h-0">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      현재 컬렉션:{" "}
                      <span className="text-foreground font-medium">
                        {selectedFolderId
                          ? getFolderLabel(folderOptions, selectedFolderId)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-9 px-3 rounded-sm border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                        onClick={openCollectionRunDialog}
                        disabled={
                          !selectedFolderId ||
                          collectionExportStats.exportableCount === 0
                        }
                        title="컬렉션 시나리오 전체 실행"
                      >
                        <Play className="w-4 h-4" />
                        전체 실행
                      </button>
                      <button
                        type="button"
                        className="h-9 px-3 rounded-sm border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                        onClick={openCollectionExportDialog}
                        disabled={
                          !selectedFolderId ||
                          collectionExportStats.exportableCount === 0
                        }
                        title="컬렉션 시나리오 Postman ZIP 다운로드"
                      >
                        <Download className="w-4 h-4" />
                        전체 다운로드
                      </button>
                      <FinixPrimaryButton
                        onClick={startCreate}
                        disabled={folders.length === 0}
                        className="h-9 px-3 w-auto rounded-sm text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        이 컬렉션에 등록
                      </FinixPrimaryButton>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-stretch flex-1 min-h-0 overflow-hidden">
                    <div
                      className={[
                        "flex-1 min-w-0 overflow-auto",
                        !previewCollapsed
                          ? "lg:w-1/2 lg:max-h-[min(70vh,800px)]"
                          : "w-full",
                      ].join(" ")}
                    >
                      <ScenarioListTable
                        items={filtered}
                        selectedScenarioId={selectedScenarioId}
                        previewCollapsed={previewCollapsed}
                        emptyCopy={scenarioListEmptyCopy}
                        actions="full"
                        runningId={runningId}
                        exportingId={exportingId}
                        confirmDeleteScenarioId={confirmDeleteScenarioId}
                        onSelectRow={togglePreviewFor}
                        onRegister={startCreate}
                        onOpenHistory={() => navigate("/history")}
                        onEdit={startEdit}
                        onRun={(item) => void openScenarioRunDialog(item)}
                        onExport={openPostmanExportDialog}
                        onRequestDelete={remove}
                        onConfirmDeleteOpenChange={(v, id) =>
                          setConfirmDeleteScenarioId(v ? id : null)
                        }
                        onConfirmDelete={confirmRemoveScenario}
                        onCancelDelete={() => setConfirmDeleteScenarioId(null)}
                      />
                    </div>

                    {!previewCollapsed ? (
                      <ScenarioPreviewPanel
                        selectedScenario={selectedScenario}
                        onClose={() => setPreviewCollapsed(true)}
                      />
                    ) : null}
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>

        </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent
          className={`${FINIX_LARGE_MODAL_CONTENT} rounded-sm`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (scenarioWizardStep === 1) {
              focusScenarioServiceSearch();
            }
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left space-y-2">
            <DialogTitle className="pr-10 text-lg font-semibold">
              {editingId ? "시나리오 편집" : "시나리오 등록"}
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {scenarioWizardStep === 1
                  ? "1/3 서비스 · 테스트 케이스 조립"
                  : scenarioWizardStep === 2
                    ? "2/3 런타임 컨텍스트 흐름"
                    : "3/3 제목 · 컬렉션 · 설명"}
                {editingId &&
                resolveScenarioSaveStatus(
                  items.find((i) => i.id === editingId) ?? { saveStatus: "ready" },
                ) === "draft"
                  ? " · 임시저장본"
                  : ""}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div
            className={`px-6 py-4 flex-1 min-h-0 ${
              scenarioWizardStep === 1 || scenarioWizardStep === 2
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto"
            }`}
          >
            {scenarioWizardStep === 1 ? (
              <div className="flex flex-col gap-5 flex-1 min-h-0">
                {catalogError ? (
                  <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2 shrink-0">
                    {catalogError}
                  </div>
                ) : null}
                <FinixField
                  label="서비스"
                  helperText="검색해 추가 · 카드 클릭 시 해당 서비스 테스트케이스 후보만 표시 · 드래그로 순서 변경"
                  className="shrink-0"
                >
                  <ServiceCatalogCombobox
                    inputRef={scenarioServiceInputRef}
                    options={catalogOptions}
                    value={servicePickerCode}
                    onValueChange={handleServiceCatalogPick}
                    loading={catalogLoading}
                    disabled={catalogOptions.length === 0}
                  />
                  <div
                    className="mt-2 flex flex-nowrap items-stretch gap-2 min-h-[4.75rem] overflow-x-auto overflow-y-hidden py-0.5"
                    onPointerDown={() => {
                      if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                      }
                    }}
                  >
                    {serviceDrafts.length === 0 ? (
                      <div className="flex-1 min-w-full rounded-sm border border-dashed border-border bg-muted/10 px-4 py-3 text-sm text-muted-foreground text-center">
                        서비스를 검색해 추가하세요.
                      </div>
                    ) : (
                      serviceDrafts.map((s, idx) => (
                        <ServiceRow
                          key={s.id}
                          svc={s}
                          index={idx}
                          move={moveService}
                          remove={removeService}
                          isActive={s.code === activeServiceCode}
                          onSelect={selectServiceInSequence}
                        />
                      ))
                    )}
                  </div>
                </FinixField>

                <ScenarioTestcaseTransfer
                  leftRulePool={leftRulePool}
                  selectedRulePicks={selectedRulePicks}
                  rulePickLoading={rulePickLoading}
                  hasServices={serviceDrafts.length > 0}
                  activeServiceCode={activeServiceCode}
                  pickHealthById={pickHealthById}
                  onAcknowledgePick={acknowledgeSelectedPick}
                  onAdd={addRuleToSelected}
                  onRemove={removeRuleFromSelected}
                  onReorder={reorderSelectedRules}
                  onAddByCaseType={addRulesByCaseType}
                  onRemoveAll={removeAllRulesFromSelected}
                  parseDragRuleId={parseDragRuleId}
                />
              </div>
            ) : scenarioWizardStep === 2 ? (
              <div className="flex flex-col flex-1 min-h-0 min-w-0 -mx-1 px-1">
                <ScenarioConnectionWizardStep
                  serviceDrafts={serviceDrafts.map((s) => ({
                    code: s.code,
                    name: s.name,
                  }))}
                  selectedRuleTestcases={selectedRulePicks}
                  bindings={stepBindingsByStepKey}
                  onBindingsChange={setStepBindingsByStepKey}
                  postmanConfig={postmanConfig}
                  onPostmanConfigChange={setPostmanConfig}
                  onOpenCollectionVars={() => setCollectionVarsOpen(true)}
                  bodyFlushRef={bodyFlushRef}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FinixField label="제목" helperText="표준 시나리오 이름">
                  <FinixUnderlineInput
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 급여이체 입력 검증"
                  />
                </FinixField>

                <FinixField label="컬렉션(폴더)">
                  <FinixUnderlineSelect
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    disabled={folderOptions.length === 0}
                  >
                    {folderOptions.length === 0 ? (
                      <option value="">컬렉션을 먼저 만드세요</option>
                    ) : (
                      folderOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {`${"—".repeat(f.depth)} ${f.label}`}
                        </option>
                      ))
                    )}
                  </FinixUnderlineSelect>
                </FinixField>

                <div className="md:col-span-2">
                  <FinixField label="설명">
                    <FinixUnderlineTextarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="이 시나리오가 검증하는 의도/범위를 간단히 적어주세요."
                      className="h-24"
                    />
                  </FinixField>
                </div>

                <div className="md:col-span-2">
                  <FinixField
                    label="태그"
                    helperText="예: 결제, Negative, Input validation"
                  >
                    <FinixUnderlineInput
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      placeholder="콤마로 구분"
                    />
                  </FinixField>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 gap-2 sm:gap-2">
            {scenarioWizardStep === 1 ? (
              <>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                  onClick={saveDraft}
                  disabled={wizardSaving}
                >
                  {wizardSaving ? "저장 중…" : "임시저장"}
                </button>
                <FinixPrimaryButton
                  type="button"
                  onClick={() => {
                    if (serviceDrafts.length === 0) {
                      setError("서비스를 1개 이상 추가하세요.");
                      return;
                    }
                    setError(null);
                    setScenarioWizardStep(2);
                  }}
                  disabled={wizardSaving}
                  className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-1"
                >
                  다음
                  <ChevronRight className="w-4 h-4" />
                </FinixPrimaryButton>
              </>
            ) : scenarioWizardStep === 2 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-sm border border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground inline-flex items-center gap-1.5"
                    onClick={() => setCollectionVarsOpen(true)}
                  >
                    <Variable className="w-4 h-4" />
                    헤더 설정
                  </button>
                  {wizardRunSteps.length >= 2 ? (
                    <button
                      type="button"
                      className="h-9 px-3 rounded-sm border border-dashed border-border text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground inline-flex items-center gap-1.5"
                      onClick={() => setAiSuggestOpen(true)}
                    >
                      <Sparkles className="w-4 h-4" />
                      AI 연결 제안
                    </button>
                  ) : null}
                  {hasWizardBindingsToClear ? (
                    <button
                      type="button"
                      className="h-9 px-3 rounded-sm border border-dashed border-destructive/40 text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive inline-flex items-center gap-1.5"
                      onClick={() => setClearBindingsOpen(true)}
                    >
                      <Link2Off className="w-4 h-4" />
                      모든 연결 해제
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted inline-flex items-center gap-1"
                  onClick={() => {
                    setError(null);
                    setScenarioWizardStep(1);
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                  onClick={saveDraft}
                  disabled={wizardSaving}
                >
                  {wizardSaving ? "저장 중…" : "임시저장"}
                </button>
                <FinixPrimaryButton
                  type="button"
                  onClick={() => {
                    setError(null);
                    setScenarioWizardStep(3);
                  }}
                  disabled={wizardSaving}
                  className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-1"
                >
                  다음
                  <ChevronRight className="w-4 h-4" />
                </FinixPrimaryButton>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted inline-flex items-center gap-1"
                  onClick={() => {
                    setError(null);
                    setScenarioWizardStep(2);
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  닫기
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
                  onClick={saveDraft}
                  disabled={wizardSaving}
                >
                  {wizardSaving ? "저장 중…" : "임시저장"}
                </button>
                <FinixPrimaryButton
                  onClick={save}
                  disabled={wizardSaving}
                  className="h-9 px-4 w-auto rounded-sm"
                >
                  {wizardSaving ? "저장 중…" : "완료"}
                </FinixPrimaryButton>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderDialog}
        onOpenChange={(v) => {
          setFolderDialog(v);
          if (!v) {
            setFolderEditingId(null);
            setFolderName("");
            setFolderParentId(null);
          }
        }}
      >
        <DialogContent className="w-full max-h-[92vh] overflow-y-auto sm:max-w-lg rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">
              {folderEditingId ? "컬렉션 편집" : "컬렉션 생성"}
            </DialogTitle>
            <DialogDescription>
              Postman의 상위 Collection처럼 폴더를 계층으로 구성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <FinixField label="이름">
              <FinixUnderlineInput
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="예: 결제 / 예금 / 고객 등"
              />
            </FinixField>
            <FinixField label="상위 컬렉션(선택)">
              <FinixUnderlineSelect
                value={folderParentId ?? ""}
                onChange={(e) =>
                  setFolderParentId(e.target.value ? e.target.value : null)
                }
              >
                <option value="">(없음)</option>
                {folderOptions
                  .filter((f) => f.id !== folderEditingId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {`${"—".repeat(f.depth)} ${f.label}`}
                    </option>
                  ))}
              </FinixUnderlineSelect>
            </FinixField>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
              onClick={() => setFolderDialog(false)}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={saveFolder}
              className="h-9 px-4 w-auto rounded-sm"
            >
              저장
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScenarioCollectionVarsDialog
        open={open && scenarioWizardStep === 2 && collectionVarsOpen}
        onOpenChange={setCollectionVarsOpen}
        config={postmanConfig}
        onChange={handlePostmanConfigChange}
      />

      <ScenarioAiSuggestionsPanel
        open={open && scenarioWizardStep === 2 && aiSuggestOpen}
        onOpenChange={setAiSuggestOpen}
        runSteps={wizardRunSteps}
        loading={aiBindingSuggestions.loading}
        error={aiBindingSuggestions.error}
        message={aiBindingSuggestions.message}
        links={aiBindingSuggestions.lastLinks}
        onFetch={() => void aiBindingSuggestions.fetchSuggestions()}
        onApplyAll={() => void aiBindingSuggestions.applySuggestions("replace")}
        onApplySelected={(links) =>
          void aiBindingSuggestions.applySuggestions("append", links)
        }
      />

      <AlertDialog open={clearBindingsOpen} onOpenChange={setClearBindingsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모든 연결 해제</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>시나리오 단계 간 연결을 모두 지웁니다.</p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
                  <li>응답 변수(extract) {wizardBindingStats.extractCount}건</li>
                  <li>요청 연결(inject) {wizardBindingStats.injectCount}건</li>
                </ul>
                {wizardBindingStats.overrideCount > 0 ? (
                  <p className="text-[11px]">
                    body 고정값(override) {wizardBindingStats.overrideCount}건은
                    유지됩니다.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setStepBindingsByStepKey((prev) =>
                  clearAllScenarioBindings(wizardRunSteps, prev),
                );
                setClearBindingsOpen(false);
              }}
            >
              해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={collectionExportOpen}
        onOpenChange={(open) => {
          if (!open) closeCollectionExportDialog();
        }}
      >
        <DialogContent className="w-full max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">컬렉션 Postman 다운로드</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm">
                <span>
                  컬렉션 «
                  {selectedFolderId
                    ? getFolderLabel(folderOptions, selectedFolderId)
                    : "—"}
                  »의 시나리오{" "}
                  <span className="font-medium text-foreground">
                    {collectionExportStats.exportableCount}개
                  </span>
                  를 Postman JSON ZIP으로 받습니다.
                </span>
                {collectionExportStats.skippedCount > 0 ? (
                  <span className="block text-[11px] text-muted-foreground">
                    임시저장이거나 DB 테스트 케이스가 불완전한{" "}
                    {collectionExportStats.skippedCount}개는 제외됩니다.
                  </span>
                ) : null}
                <span className="block text-[11px] text-muted-foreground">
                  검색·필터와 관계없이 이 컬렉션에 등록된 전체 시나리오가
                  대상입니다.
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {!collectionExportLoading ? (
            <ScenarioPostmanExportDialogForm
              postmanConfig={collectionExportPostmanDraft}
              onPostmanConfigChange={setCollectionExportPostmanDraft}
              filename={collectionExportFilename}
              onFilenameChange={setCollectionExportFilename}
              defaultFilename={collectionExportDefaultFilename}
              baseUrlHint="baseUrl은 이번 ZIP export의 모든 시나리오에 적용됩니다."
            />
          ) : null}

          {collectionExportLoading ? (
            <div className="py-6">
              <FinixLoading
                size="md"
                center
                label={
                  collectionExportProgress
                    ? `시나리오 ${collectionExportProgress.done}/${collectionExportProgress.total} Postman 생성 중…`
                    : "ZIP 생성 중…"
                }
              />
            </div>
          ) : collectionExportError ? (
            <p className="text-sm text-destructive">{collectionExportError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closeCollectionExportDialog}
              disabled={collectionExportLoading}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={() => void confirmCollectionExport()}
              disabled={collectionExportLoading}
              className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
            >
              {collectionExportLoading ? (
                <>
                  <FinixLoading size="sm" inline />
                  생성 중…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  ZIP 다운로드
                </>
              )}
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={postmanExportTarget !== null}
        onOpenChange={(open) => {
          if (!open) closePostmanExportDialog();
        }}
      >
        <DialogContent className="w-full max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">Postman 컬렉션 다운로드</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <span>{postmanExportTarget?.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  변수 연결·body 고정값이 포함된 Postman 컬렉션입니다.
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {!postmanExportLoading ? (
            <ScenarioPostmanExportDialogForm
              postmanConfig={postmanExportDraft}
              onPostmanConfigChange={setPostmanExportDraft}
              filename={postmanExportFilename}
              onFilenameChange={setPostmanExportFilename}
              defaultFilename={postmanExportDefaultFilename}
              baseUrlHint="baseUrl은 이번 export에만 적용되며, 저장 후 다음 다운로드에도 유지됩니다."
            />
          ) : null}

          {postmanExportLoading ? (
            <div className="py-6">
              <FinixLoading
                size="md"
                center
                label="시나리오 저장 및 Postman 파일 생성 중…"
              />
            </div>
          ) : postmanExportError ? (
            <p className="text-sm text-destructive">{postmanExportError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closePostmanExportDialog}
              disabled={postmanExportLoading}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={() => void confirmPostmanExport()}
              disabled={postmanExportLoading || postmanExportTarget === null}
              className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
            >
              {postmanExportLoading ? (
                <>
                  <FinixLoading size="sm" inline />
                  생성 중…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  다운로드
                </>
              )}
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scenarioRunTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeScenarioRunDialog();
        }}
      >
        <DialogContent className="w-full max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">시나리오 실행</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <span>{scenarioRunTarget?.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  변수 연결·헤더가 적용된 요청으로 실행합니다.
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>

          {!scenarioRunLoading ? (
            <ScenarioRunDialogForm
              postmanConfig={scenarioRunDraft}
              onPostmanConfigChange={setScenarioRunDraft}
              mode={scenarioRunMode}
              onModeChange={setScenarioRunMode}
              onOpenHeaderSettings={() => setScenarioRunHeaderOpen(true)}
              baseUrlHint="baseUrl·헤더는 저장 후 이번 실행에 반영됩니다."
            />
          ) : null}

          {scenarioRunLoading && scenarioRunFocus ? (
            <ScenarioRunFocusProgress
              steps={scenarioRunFocus.steps}
              currentIndex={scenarioRunFocus.currentIndex}
              status={scenarioRunFocus.status}
              total={scenarioRunFocus.total}
            />
          ) : scenarioRunLoading ? (
            <div className="py-6">
              <FinixLoading size="md" center label="시나리오 실행 중…" />
            </div>
          ) : scenarioRunError ? (
            <p className="text-sm text-destructive">{scenarioRunError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closeScenarioRunDialog}
              disabled={scenarioRunLoading}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={() => void confirmScenarioRun()}
              disabled={scenarioRunLoading || scenarioRunTarget === null}
              className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
            >
              {scenarioRunLoading ? (
                <>
                  <FinixLoading size="sm" inline />
                  실행 중…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  실행
                </>
              )}
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={collectionRunOpen}
        onOpenChange={(open) => {
          if (!open) closeCollectionRunDialog();
        }}
      >
        <DialogContent className="w-full max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="pr-10">컬렉션 실행</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm">
                <span>
                  컬렉션 «
                  {selectedFolderId
                    ? getFolderLabel(folderOptions, selectedFolderId)
                    : "—"}
                  »의 시나리오{" "}
                  <span className="font-medium text-foreground">
                    {collectionExportStats.exportableCount}개
                  </span>
                  를 순서대로 실행합니다.
                </span>
                {collectionExportStats.skippedCount > 0 ? (
                  <span className="block text-[11px] text-muted-foreground">
                    임시저장이거나 DB 테스트 케이스가 불완전한{" "}
                    {collectionExportStats.skippedCount}개는 제외됩니다.
                  </span>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>

          {!collectionRunLoading ? (
            <ScenarioRunDialogForm
              postmanConfig={collectionRunDraft}
              onPostmanConfigChange={setCollectionRunDraft}
              mode={collectionRunMode}
              onModeChange={setCollectionRunMode}
              onOpenHeaderSettings={() => setCollectionRunHeaderOpen(true)}
              baseUrlHint="baseUrl은 컬렉션 내 모든 시나리오 실행에 적용됩니다."
            />
          ) : null}

          {collectionRunLoading ? (
            <div className="py-6">
              <FinixLoading
                size="md"
                center
                label={
                  collectionRunProgress
                    ? `시나리오 ${collectionRunProgress.done}/${collectionRunProgress.total} 실행 중…`
                    : "실행 중…"
                }
              />
            </div>
          ) : collectionRunError ? (
            <p className="text-sm text-destructive">{collectionRunError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
              onClick={closeCollectionRunDialog}
              disabled={collectionRunLoading}
            >
              취소
            </button>
            <FinixPrimaryButton
              onClick={() => void confirmCollectionRun()}
              disabled={collectionRunLoading}
              className="h-9 px-4 w-auto rounded-sm inline-flex items-center gap-2"
            >
              {collectionRunLoading ? (
                <>
                  <FinixLoading size="sm" inline />
                  실행 중…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  전체 실행
                </>
              )}
            </FinixPrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScenarioCollectionVarsDialog
        open={scenarioRunTarget !== null && scenarioRunHeaderOpen}
        onOpenChange={(open) => {
          setScenarioRunHeaderOpen(open);
          if (!open) saveExecutionPostmanDefaults(scenarioRunDraft);
        }}
        config={scenarioRunDraft}
        onChange={setScenarioRunDraft}
        contentClassName="z-[130]"
        description="단건·시나리오 실행에 공통으로 쓰는 채널 헤더입니다. 닫으면 브라우저에 저장됩니다."
      />

      <ScenarioCollectionVarsDialog
        open={collectionRunOpen && collectionRunHeaderOpen}
        onOpenChange={(open) => {
          setCollectionRunHeaderOpen(open);
          if (!open) saveExecutionPostmanDefaults(collectionRunDraft);
        }}
        config={collectionRunDraft}
        onChange={setCollectionRunDraft}
        contentClassName="z-[130]"
        description="단건·시나리오 실행에 공통으로 쓰는 채널 헤더입니다. 닫으면 브라우저에 저장됩니다."
      />

      <Dialog
        open={ioDialog !== null}
        onOpenChange={(v) => {
          if (!v) {
            setIoDialog(null);
            setError(null);
          }
        }}
      >
        <DialogContent
          className={`w-full max-h-[92vh] overflow-y-auto ${FINIX_LARGE_MODAL_MAX_WIDTH} rounded-sm`}
        >
          <DialogHeader>
            <DialogTitle className="pr-10">
              {ioDialog === "export" ? "Export (JSON)" : "Import (JSON)"}
            </DialogTitle>
            <DialogDescription>
              레지스트리를 JSON으로 내보내거나 가져옵니다. (현재 로컬 저장 기반)
            </DialogDescription>
          </DialogHeader>
          <FinixField
            label={ioDialog === "export" ? "내보내기" : "가져오기"}
            helperText={
              ioDialog === "export"
                ? "전체를 복사해 파일로 저장하세요."
                : "JSON을 붙여넣고 적용하세요."
            }
          >
            <FinixUnderlineTextarea
              value={ioText}
              onChange={(e) => setIoText(e.target.value)}
              className="min-h-[360px] font-mono text-[12px] leading-relaxed"
              spellCheck={false}
              readOnly={ioDialog === "export"}
            />
          </FinixField>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
              onClick={() => setIoDialog(null)}
            >
              닫기
            </button>
            {ioDialog === "import" ? (
              <FinixPrimaryButton
                onClick={applyImport}
                className="h-9 px-4 w-auto rounded-sm"
              >
                적용
              </FinixPrimaryButton>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FolderDeleteAlertDialog
        open={confirmDeleteFolderId != null}
        folderName={folderPendingDelete?.name ?? null}
        scenarioCount={folderDeleteScenarioCount}
        confirmText={folderDeleteConfirmText}
        onConfirmTextChange={setFolderDeleteConfirmText}
        onOpenChange={(open) => {
          if (!open) closeFolderDeleteDialog();
        }}
        onConfirm={applyDeleteFolder}
      />
    </PageShell>
  );
}

