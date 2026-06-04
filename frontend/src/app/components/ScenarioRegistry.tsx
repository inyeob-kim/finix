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
    exportRegistryCollectionPostmanZip,
    exportRegistryScenarioPostman,
} from "@/lib/registryScenarioExport";
import {
    migrateBindingsToStepKeys,
    type StepBindingsByStepKey,
} from "@/lib/scenarioBindings";
import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import {
    emptyPostmanConfig,
    ensurePostmanConfig,
    startVarKeysFromConfig,
} from "@/lib/scenarioPostmanVariables";
import {
    buildRunStepsFromPicks,
    serviceNameMapFromDrafts,
} from "@/lib/scenarioRunSequence";
import { pruneOrphanInjects } from "@/lib/scenarioRuntimeContext";
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Download,
    FolderKanban,
    FolderPlus,
    PanelRightClose,
    PanelRightOpen,
    Pencil,
    Plus,
    Search,
    Sparkles,
    Trash2,
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
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useNavigate } from "react-router";
import { listTestCasesByServiceCode } from "../../api/testcaseApi";
import type { TestCaseReadDto } from "../../api/types";
import { parseMaterializedTestcaseName } from "../../lib/materializedTestcaseName";
import { useAuthStore } from "../auth/authStore";
import { PageShell } from "./PageShell";
import { ScenarioAiSuggestionsPanel } from "./scenario/ScenarioAiSuggestionsPanel";
import { ScenarioCollectionVarsDialog } from "./scenario/ScenarioCollectionVarsDialog";
import { ScenarioConnectionWizardStep } from "./scenario/ScenarioConnectionWizardStep";
import { ScenarioPostmanExportDialogForm } from "./scenario/ScenarioPostmanExportDialogForm";
import { ConfirmPopover } from "./scenarioRegistry/components/ConfirmPopover";
import { FolderTreeList } from "./scenarioRegistry/components/FolderTreeList";
import { ScenarioPreviewPanel } from "./scenarioRegistry/components/ScenarioPreviewPanel";
import { ScenarioTestcaseTransfer } from "./scenarioRegistry/components/ScenarioTestcaseTransfer";
import { ServiceRow } from "./scenarioRegistry/components/ServiceRow";
import { loadRegistryState, persistRegistryState } from "./scenarioRegistry/storage";
import type {
    RegistryStatus,
    ScenarioRegistryFolder,
    ScenarioRegistryItem,
    ScenarioRegistryStateV2,
    ScenarioRuleTestcaseRef,
    ServiceCatalogItem,
    ServiceDraft,
} from "./scenarioRegistry/types";
import {
    getFolderLabel,
    newId,
    normalizeTags,
    nowStamp,
    safeJsonParse,
} from "./scenarioRegistry/utils";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";

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
    ruleId: parsed.ruleId,
    ruleType: parsed.ruleType,
    title: row.name,
    description: parsed.shortLabel,
    backendTestcaseId: row.id,
    scenarioId: row.scenario_id,
  };
}

export function ScenarioRegistry() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const updatedBy = user?.username ?? "unknown";

  const [folders, setFolders] = useState<ScenarioRegistryFolder[]>([]);
  const [items, setItems] = useState<ScenarioRegistryItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | RegistryStatus>("");
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
  const [status, setStatus] = useState<RegistryStatus>("draft");
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
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<
    string | null
  >(null);
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
    setFolders(loaded.folders);
    setItems(loaded.scenarios);
    setSelectedFolderId(loaded.selectedFolderId);
    setHydrated(loaded.hydrated);
  }, [updatedBy]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: ScenarioRegistryStateV2 = {
        version: 2,
        folders,
        scenarios: items,
      };
      persistRegistryState(payload);
    } catch {
      // ignore
    }
  }, [hydrated, folders, items]);

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
        if (statusFilter && i.status !== statusFilter) return false;
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
  }, [items, query, statusFilter, tagFilter, selectedFolderId]);

  const selectedRuleIdSet = useMemo(
    () => new Set(selectedRulePicks.map((r) => r.id)),
    [selectedRulePicks],
  );

  const leftRulePool = useMemo(() => {
    let pool = allYamlRuleRefs.filter((r) => !selectedRuleIdSet.has(r.id));
    if (activeServiceCode) {
      pool = pool.filter((r) => r.serviceCode === activeServiceCode);
    }
    return pool;
  }, [allYamlRuleRefs, selectedRuleIdSet, activeServiceCode]);

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
        if (!cancelled) setAllYamlRuleRefs(merged);
      } finally {
        if (!cancelled) setRulePickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scenarioWizardStep, serviceDrafts]);

  const addRuleToSelected = (r: ScenarioRuleTestcaseRef) => {
    setSelectedRulePicks((prev) =>
      prev.some((x) => x.id === r.id) ? prev : [...prev, r],
    );
  };

  const removeRuleFromSelected = (id: string) => {
    setSelectedRulePicks((prev) => prev.filter((x) => x.id !== id));
  };

  const addAllRulesToSelected = () => {
    setSelectedRulePicks((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const next = [...prev];
      for (const row of leftRulePool) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        next.push(row);
      }
      return next;
    });
  };

  const removeAllRulesFromSelected = () => {
    setSelectedRulePicks([]);
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

    const byId = new Map<
      string,
      { count: number; successRate: number; lastUpdated: string }
    >();

    folders.forEach((f) => {
      const set = descendantsOf(f.id);
      const scenarios = items.filter((s) => set.has(s.folderId));
      const count = scenarios.length;
      const successRate = count
        ? Math.round(
            scenarios.reduce((acc, s) => acc + (s.status === "active" ? 92 : 75), 0) /
              count,
          )
        : 0;
      const lastUpdated =
        scenarios
          .map((s) => s.updatedAt)
          .sort((a, b) => b.localeCompare(a))[0] ?? f.updatedAt;
      byId.set(f.id, { count, successRate, lastUpdated });
    });
    return byId;
  }, [folders, items]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setServicePickerCode("");
    setDescription("");
    setTagsText("");
    setStatus("draft");
    setFolderId(selectedFolderId ?? folders[0]?.id ?? "");
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
    setStatus(item.status);
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
    setScenarioWizardStep(1);
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

  const save = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("제목은 필수입니다.");
      return;
    }
    if (serviceDrafts.length === 0) {
      setError("서비스를 1개 이상 추가하세요.");
      return;
    }
    const nextTags = normalizeTags(tagsText);
    const nextSequence: ServiceCatalogItem[] = serviceDrafts.map((s) => ({
      code: s.code,
      name: s.name,
    }));
    const nextRulePicks = [...selectedRulePicks];
    const stamp = nowStamp();

    if (!editingId) {
      const item: ScenarioRegistryItem = {
        id: newId(),
        folderId: folderId || selectedFolderId || folders[0]?.id || "",
        title: trimmedTitle,
        description: description.trim(),
        tags: nextTags,
        status,
        serviceSequence: nextSequence,
        selectedRuleTestcases:
          nextRulePicks.length > 0 ? nextRulePicks : undefined,
        stepBindingsByStepKey:
          Object.keys(stepBindingsByStepKey).length > 0
            ? stepBindingsByStepKey
            : undefined,
        postmanConfig: ensurePostmanConfig(postmanConfig),
        createdAt: stamp,
        updatedAt: stamp,
        updatedBy,
      };
      setItems((prev) => [item, ...prev]);
      setSelectedScenarioId(item.id);
      setPreviewCollapsed(false);
      setOpen(false);
      return;
    }

    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== editingId) return i;
        return {
          ...i,
          folderId: folderId || i.folderId,
          title: trimmedTitle,
          description: description.trim(),
          tags: nextTags,
          status,
          serviceSequence: nextSequence,
          selectedRuleTestcases:
            nextRulePicks.length > 0 ? nextRulePicks : undefined,
          stepBindingsByStepKey:
            Object.keys(stepBindingsByStepKey).length > 0
              ? stepBindingsByStepKey
              : undefined,
          postmanConfig: ensurePostmanConfig(postmanConfig),
          updatedAt: stamp,
          updatedBy,
        };
      }),
    );
    setOpen(false);
  };

  const openPostmanExportDialog = (item: ScenarioRegistryItem) => {
    if (!canExportRegistryScenarioPostman(item)) {
      setError(
        "포스트맨 export를 위해 시나리오에 DB 테스트 케이스가 포함되어 있어야 합니다.",
      );
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
        "다운로드할 시나리오가 없습니다. DB 테스트 케이스가 포함된 시나리오만 export할 수 있습니다.",
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
      setError("하위 폴더가 있는 폴더는 삭제할 수 없습니다.");
      return;
    }
    setConfirmDeleteFolderId(id);
  };

  const applyDeleteFolder = (idOverride?: string) => {
    const id = idOverride ?? confirmDeleteFolderId;
    if (!id) return;

    const f = folders.find((x) => x.id === id);
    if (!f) {
      setConfirmDeleteFolderId(null);
      return;
    }

    // Choose a fallback folder that is NOT the one being deleted.
    const fallbackExisting =
      f.parentId ?? folders.find((x) => x.parentId == null && x.id !== id)?.id;

    // If this is the last remaining folder, create a new root so the UI doesn't go blank.
    const needNewRoot = !fallbackExisting && folders.length <= 1;
    const stamp = nowStamp();
    const newRoot: ScenarioRegistryFolder | null = needNewRoot
      ? {
          id: newId(),
          name: "Default",
          parentId: null,
          createdAt: stamp,
          updatedAt: stamp,
          updatedBy,
        }
      : null;

    const fallback = fallbackExisting ?? newRoot?.id ?? null;

    if (fallback) {
      setItems((prev) =>
        prev.map((s) => (s.folderId === id ? { ...s, folderId: fallback } : s)),
      );
    }

    setFolders((prev) => {
      const kept = prev.filter((x) => x.id !== id);
      return newRoot ? [newRoot, ...kept] : kept;
    });

    if (selectedFolderId === id) setSelectedFolderId(fallback);
    setConfirmDeleteFolderId(null);
  };

  const exportJson = () => {
    const payload: ScenarioRegistryStateV2 = {
      version: 2,
      folders,
      scenarios: items,
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
    setItems(parsed.scenarios ?? []);
    setSelectedFolderId(parsed.folders?.[0]?.id ?? null);
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
    >

        {error ? (
          <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="bg-card border border-border rounded-sm shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-end gap-6">
            <div className="flex flex-wrap items-end gap-6">
              <FinixField label="상태" className="min-w-[10rem]">
                <FinixUnderlineSelect
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                >
                  <option value="">전체</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </FinixUnderlineSelect>
              </FinixField>
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
          <div className="flex-1 min-h-0 md:hidden">
            <div className="border-t border-border flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-sm font-medium">Collections</div>
                <button
                  type="button"
                  className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="상위 컬렉션 추가"
                  onClick={() => startCreateFolder(null)}
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2 overflow-auto">
                {folderOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">
                    폴더가 없습니다.
                  </p>
                ) : (
                  <FolderTreeList
                    folderOptions={folderOptions}
                    folders={folders}
                    folderSummary={folderSummary}
                    selectedFolderId={selectedFolderId}
                    setSelectedFolderId={setSelectedFolderId}
                    startCreateFolder={startCreateFolder}
                    startEditFolder={startEditFolder}
                    removeFolder={removeFolder}
                    applyDeleteFolder={applyDeleteFolder}
                    confirmDeleteFolderId={confirmDeleteFolderId}
                    setConfirmDeleteFolderId={setConfirmDeleteFolderId}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-border flex flex-col min-h-0">
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
                    className="h-9 px-3 w-auto rounded-sm text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    등록
                  </FinixPrimaryButton>
                </div>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="hover:bg-transparent border-b border-border">
                      <TableHead className="text-xs font-semibold text-muted-foreground min-w-[220px]">
                        시나리오
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">
                        상태
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">
                        태그
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">
                        수정
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">
                        수정자
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground w-[160px] text-left">
                        작업
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-muted-foreground text-sm"
                        >
                          <div className="max-w-lg mx-auto space-y-4">
                            <div className="text-sm font-medium text-foreground">
                              이 컬렉션에 등록된 시나리오가 없습니다.
                            </div>
                            <div className="flex items-center justify-center pt-1">
                              <FinixPrimaryButton
                                onClick={startCreate}
                                className="h-9 px-4 w-auto rounded-sm text-sm"
                              >
                                <Plus className="w-4 h-4" />
                                시나리오 등록
                              </FinixPrimaryButton>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((item) => {
                        const isSelected = item.id === selectedScenarioId;
                        const tcCount = item.selectedRuleTestcases?.length ?? 0;
                        return (
                        <TableRow
                          key={item.id}
                          className={[
                            "border-b border-border cursor-pointer",
                            "hover:bg-muted/40",
                            isSelected ? "bg-muted/50" : "",
                          ].join(" ")}
                          onClick={() => togglePreviewFor(item.id)}
                        >
                          <TableCell className="py-3 align-top">
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">
                                {item.title}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-normal">
                                {item.description || "—"}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                테스트 케이스 {tcCount}개
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 align-top">
                            <span
                              className={[
                                "inline-flex items-center px-2.5 py-0.5 rounded-sm text-[11px] font-medium border",
                                item.status === "active"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-[#5b8cff]/10 text-[#3d6ff2] border-[#5b8cff]/25",
                              ].join(" ")}
                            >
                              {item.status === "active" ? "Active" : "Draft"}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 align-top text-xs text-muted-foreground">
                            {item.tags.slice(0, 2).join(", ")}
                          </TableCell>
                          <TableCell className="py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                            {item.updatedAt}
                          </TableCell>
                          <TableCell className="py-3 align-top text-xs text-muted-foreground font-mono">
                            {item.updatedBy}
                          </TableCell>
                          <TableCell className="py-3 text-right align-top">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate("/history");
                              }}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="View Report"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      )})
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Desktop (resizable) */}
          <div className="hidden md:block flex-1 min-h-0 h-full">
            <ResizablePanelGroup
              direction="horizontal"
              className="h-full items-stretch"
            >
              <ResizablePanel defaultSize={25} minSize={18} maxSize={40}>
                <div className="h-full border-t border-border flex flex-col min-h-0">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-medium">Collections</div>
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
                        folders={folders}
                        folderSummary={folderSummary}
                        selectedFolderId={selectedFolderId}
                        setSelectedFolderId={setSelectedFolderId}
                        startCreateFolder={startCreateFolder}
                        startEditFolder={startEditFolder}
                        removeFolder={removeFolder}
                        applyDeleteFolder={applyDeleteFolder}
                        confirmDeleteFolderId={confirmDeleteFolderId}
                        setConfirmDeleteFolderId={setConfirmDeleteFolderId}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle
                withHandle
                className="w-[3px] bg-muted-foreground/20 hover:bg-muted-foreground/30 self-stretch h-full z-10 cursor-col-resize"
              />
              <ResizablePanel defaultSize={75} minSize={50}>
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
                        className="h-9 px-3 w-auto rounded-sm text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        이 컬렉션에 등록
                      </FinixPrimaryButton>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden flex">
                    <div className="flex-1 min-w-0 overflow-auto">
                      <Table>
                      <TableHeader className="bg-muted/60">
                        <TableRow className="hover:bg-transparent border-b border-border">
                          <TableHead className="text-xs font-semibold text-muted-foreground min-w-[220px]">
                            시나리오
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground">
                            상태
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground">
                            태그
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground">
                            수정
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground">
                            수정자
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground w-[160px] text-left">
                            작업
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="py-12 text-center text-muted-foreground text-sm"
                            >
                              <div className="max-w-lg mx-auto space-y-4">
                                <div className="text-sm font-medium text-foreground">
                                  이 컬렉션에 등록된 시나리오가 없습니다.
                                </div>
                                <div className="flex items-center justify-center pt-1">
                                  <FinixPrimaryButton
                                    onClick={startCreate}
                                    className="h-9 px-4 w-auto rounded-sm text-sm"
                                  >
                                    <Plus className="w-4 h-4" />
                                    시나리오 등록
                                  </FinixPrimaryButton>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filtered.map((item) => {
                            const isSelected = item.id === selectedScenarioId;
                            const tcCount = item.selectedRuleTestcases?.length ?? 0;
                            return (
                            <TableRow
                              key={item.id}
                              className={[
                                "border-b border-border cursor-pointer",
                                "hover:bg-muted/40",
                                isSelected ? "bg-muted/50" : "",
                              ].join(" ")}
                              onClick={() => togglePreviewFor(item.id)}
                            >
                              <TableCell className="py-3 align-top">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-snug">
                                    {item.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-normal">
                                    {item.description || "—"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                    테스트 케이스 {tcCount}개
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="py-3 align-top">
                                <span
                                  className={[
                                    "inline-flex items-center px-2.5 py-0.5 rounded-sm text-[11px] font-medium border",
                                    item.status === "active"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : "bg-[#5b8cff]/10 text-[#3d6ff2] border-[#5b8cff]/25",
                                  ].join(" ")}
                                >
                                  {item.status === "active" ? "Active" : "Draft"}
                                </span>
                              </TableCell>
                              <TableCell className="py-3 align-top">
                                <div className="flex flex-wrap gap-1 max-w-[220px]">
                                  {item.tags.slice(0, 3).map((t) => (
                                    <span
                                      key={t}
                                      className="inline-flex max-w-[140px] truncate px-2 py-0.5 rounded-sm text-[11px] font-medium bg-muted text-muted-foreground border border-border"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                  {item.tags.length > 3 ? (
                                    <span className="text-[11px] text-muted-foreground px-1 self-center">
                                      +{item.tags.length - 3}
                                    </span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                                {item.updatedAt}
                              </TableCell>
                              <TableCell className="py-3 align-top text-xs text-muted-foreground font-mono">
                                {item.updatedBy}
                              </TableCell>
                              <TableCell className="py-3 text-right align-top">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(item.id);
                                    }}
                                    className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors"
                                    title="편집"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPostmanExportDialog(item);
                                    }}
                                    disabled={
                                      exportingId === item.id ||
                                      !canExportRegistryScenarioPostman(item)
                                    }
                                    className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                                    title={
                                      canExportRegistryScenarioPostman(item)
                                        ? "Postman 컬렉션 다운로드"
                                        : "DB 테스트 케이스가 포함된 시나리오만 export 가능"
                                    }
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <ConfirmPopover
                                    open={confirmDeleteScenarioId === item.id}
                                    onOpenChange={(v) =>
                                      setConfirmDeleteScenarioId(v ? item.id : null)
                                    }
                                    anchor={
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          remove(item.id);
                                        }}
                                        className="p-2 rounded-sm border border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-destructive transition-colors"
                                        title="삭제"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    }
                                    title="시나리오를 삭제할까요?"
                                    description={
                                      <span className="line-clamp-2">{item.title}</span>
                                    }
                                    onCancel={() => setConfirmDeleteScenarioId(null)}
                                    onConfirm={confirmRemoveScenario}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          )})
                        )}
                      </TableBody>
                    </Table>
                    </div>

                    <ScenarioPreviewPanel
                      previewCollapsed={previewCollapsed}
                      setPreviewCollapsed={setPreviewCollapsed}
                      selectedScenario={selectedScenario}
                    />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
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
                    : "3/3 제목 · 상태 · 컬렉션 · 설명"}
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
                  <DndProvider backend={HTML5Backend}>
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
                  </DndProvider>
                </FinixField>

                <ScenarioTestcaseTransfer
                  leftRulePool={leftRulePool}
                  selectedRulePicks={selectedRulePicks}
                  rulePickLoading={rulePickLoading}
                  hasServices={serviceDrafts.length > 0}
                  activeServiceCode={activeServiceCode}
                  onAdd={addRuleToSelected}
                  onRemove={removeRuleFromSelected}
                  onAddAll={addAllRulesToSelected}
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
                  onOpenCollectionVars={() => setCollectionVarsOpen(true)}
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
                <FinixField label="상태">
                  <FinixUnderlineSelect
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as RegistryStatus)
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </FinixUnderlineSelect>
                </FinixField>

                <FinixField label="컬렉션(폴더)">
                  <FinixUnderlineSelect
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                  >
                    {folderOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {`${"—".repeat(f.depth)} ${f.label}`}
                      </option>
                    ))}
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
                  취소
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
                    컬렉션 설정
                    {startVarKeysFromConfig(postmanConfig).length > 0 ? (
                      <span className="text-[10px] tabular-nums text-primary">
                        ({startVarKeysFromConfig(postmanConfig).length})
                      </span>
                    ) : null}
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
                  취소
                </button>
                <FinixPrimaryButton
                  type="button"
                  onClick={() => {
                    setError(null);
                    setScenarioWizardStep(3);
                  }}
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
                  취소
                </button>
                <FinixPrimaryButton
                  onClick={save}
                  className="h-9 px-4 w-auto rounded-sm"
                >
                  저장
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
      />

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
                    DB 테스트 케이스가 없는 {collectionExportStats.skippedCount}
                    개는 제외됩니다.
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
    </PageShell>
  );
}

