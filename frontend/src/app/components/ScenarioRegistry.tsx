import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";
import {
  FolderKanban,
  Plus,
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  Upload,
  Download,
  FolderPlus,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Wand2,
  Play,
  Sparkles,
  BarChart3,
  Zap,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createScenario, patchScenario } from "../../api/scenarioApi";
import {
  FINIX_LARGE_MODAL_CONTENT,
  FINIX_LARGE_MODAL_MAX_WIDTH,
} from "@/lib/finixModalLayout";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  FinixField,
  FinixUnderlineInput,
  FinixUnderlineSelect,
  FinixUnderlineTextarea,
} from "./ui/finix-form";
import { FinixPrimaryButton, FinixPrimaryLink } from "./ui/finix-button";
import { FinixLoading } from "./ui/finix-loading";
import { useAuthStore } from "../auth/authStore";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import { SERVICE_ITEM_TYPE } from "./scenarioRegistry/constants";
import { ServiceCatalogCombobox } from "./ServiceCatalogCombobox";
import { useServiceCatalogPicker } from "@/hooks/useServiceCatalogPicker";
import type {
  RegistryStatus,
  ScenarioRegistryFolder,
  ScenarioRegistryItem,
  ScenarioRegistryStateV2,
  ScenarioRuleTestcaseRef,
  ServiceCatalogItem,
  ServiceDraft,
} from "./scenarioRegistry/types";
import { loadRegistryState, persistRegistryState } from "./scenarioRegistry/storage";
import {
  calcCoverage,
  calcEdgeCases,
  getFolderLabel,
  hash01,
  newId,
  normalizeTags,
  nowStamp,
  safeJsonParse,
} from "./scenarioRegistry/utils";
import { ServiceRow } from "./scenarioRegistry/components/ServiceRow";
import { FolderTreeList } from "./scenarioRegistry/components/FolderTreeList";
import { ScenarioPreviewPanel } from "./scenarioRegistry/components/ScenarioPreviewPanel";
import { ConfirmPopover } from "./scenarioRegistry/components/ConfirmPopover";
import { ScenarioTestcaseTransfer } from "./scenarioRegistry/components/ScenarioTestcaseTransfer";
import { listTestCasesByServiceCode } from "../../api/testcaseApi";
import type { TestCaseReadDto } from "../../api/types";
import { parseMaterializedTestcaseName } from "../../lib/materializedTestcaseName";

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
  const [openingId, setOpeningId] = useState<string | null>(null);
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
  const [scenarioWizardStep, setScenarioWizardStep] = useState<1 | 2>(1);
  const [rulePickLoading, setRulePickLoading] = useState(false);
  const [allYamlRuleRefs, setAllYamlRuleRefs] = useState<ScenarioRuleTestcaseRef[]>(
    [],
  );
  const [selectedRulePicks, setSelectedRulePicks] = useState<
    ScenarioRuleTestcaseRef[]
  >([]);
  const [hydrated, setHydrated] = useState(false);

  const {
    options: catalogOptions,
    loading: catalogLoading,
    error: catalogError,
  } = useServiceCatalogPicker({ enabled: open });

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

  const scenarioMetrics = useMemo(() => {
    const total = filtered.length;
    const aiGenerated = filtered.filter((x) =>
      x.tags.some((t) => t.toLowerCase().includes("ai")),
    ).length;
    const aiRatio = total ? Math.round((aiGenerated / total) * 100) : 0;
    const avgCoverage = total
      ? Math.round(
          filtered.reduce((acc, x) => {
            const base = 60 + Math.min(35, (x.serviceSequence?.length ?? 0) * 8);
            return acc + base;
          }, 0) / total,
        )
      : 0;
    const successRate = total
      ? Math.round(
          filtered.reduce((acc, x) => {
            const s = x.status === "active" ? 92 : 75;
            return acc + s;
          }, 0) / total,
        )
      : 0;
    const failedApis = Math.max(0, Math.round((100 - successRate) / 7));
    return {
      total,
      aiRatio,
      successRate,
      failedApis,
      coverage: avgCoverage,
    };
  }, [filtered]);

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
    setSelectedRulePicks(
      item.selectedRuleTestcases?.length
        ? [...item.selectedRuleTestcases]
        : [],
    );
    setScenarioWizardStep(1);
    setError(null);
    setOpen(true);
  };

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
    const seqCodes = new Set(nextSequence.map((s) => s.code));
    const nextRulePicks = selectedRulePicks.filter((r) =>
      seqCodes.has(r.serviceCode),
    );
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
          updatedAt: stamp,
          updatedBy,
        };
      }),
    );
    setOpen(false);
  };

  const openAsScenario = async (item: ScenarioRegistryItem) => {
    try {
      setOpeningId(item.id);
      const picks = item.selectedRuleTestcases ?? [];
      const testcaseSelections = picks
        .filter((x) => x.backendTestcaseId != null)
        .map((x) => ({
          id: x.backendTestcaseId!,
          scenarioId: x.scenarioId ?? null,
          name: x.title,
          serviceCode: x.serviceCode,
        }));
      navigate("/test-case", {
        state: {
          from: "/scenario-registry",
          registry: {
            title: item.title,
            description: item.description,
            tags: item.tags,
            serviceSequence: item.serviceSequence ?? [],
            testcaseSelections:
              testcaseSelections.length > 0 ? testcaseSelections : undefined,
            ruleSelections:
              testcaseSelections.length > 0
                ? undefined
                : picks
                    .filter((x) => (x.ruleId ?? "").trim())
                    .map((x) => ({
                      serviceCode: x.serviceCode,
                      ruleId: (x.ruleId ?? "").trim(),
                      title: x.title,
                    })),
          },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "테스트케이스 생성에 실패했습니다.");
    } finally {
      setOpeningId(null);
    }
  };

  const runFromRegistry = async (item: ScenarioRegistryItem) => {
    // Run now means: go to testcase generation screen (no API calls)
    await openAsScenario(item);
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
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="h-9 px-3 rounded-sm border border-border bg-background text-sm font-medium hover:bg-muted transition-colors inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            type="button"
            onClick={importJson}
            className="h-9 px-3 rounded-sm border border-border bg-background text-sm font-medium hover:bg-muted transition-colors inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>
      }
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
                <FinixPrimaryButton
                  onClick={startCreate}
                  className="h-9 px-3 w-auto rounded-sm text-sm"
                >
                  <Plus className="w-4 h-4" />
                  등록
                </FinixPrimaryButton>
              </div>
              <div className="px-4 py-3 border-b border-border bg-background">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-sm border border-border bg-card px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Total</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {scenarioMetrics.total}
                    </div>
                  </div>
                  <div className="rounded-sm border border-border bg-card px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">AI Generated</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {scenarioMetrics.aiRatio}%
                    </div>
                  </div>
                  <div className="rounded-sm border border-border bg-card px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Success</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {scenarioMetrics.successRate}%
                    </div>
                  </div>
                  <div className="rounded-sm border border-border bg-card px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">Coverage</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {scenarioMetrics.coverage}%
                    </div>
                  </div>
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
                        const svcCount = item.serviceSequence?.length ?? 0;
                        const coverage = calcCoverage(svcCount);
                        const edgeCases = calcEdgeCases(svcCount);
                        const isAi = item.tags.some((t) =>
                          t.toLowerCase().includes("ai"),
                        );
                        const lastRunRoll = hash01(item.id);
                        const lastRun =
                          lastRunRoll < 0.72 ? "PASS" : lastRunRoll < 0.92 ? "FAIL" : "RUNNING";
                        const lastRunAgeMin = 2 + Math.floor(hash01(item.updatedAt) * 57);
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
                              <div className="flex items-start gap-2">
                                <span
                                  className={[
                                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                                    lastRun === "PASS"
                                      ? "bg-success"
                                      : lastRun === "FAIL"
                                        ? "bg-destructive"
                                        : "bg-primary animate-pulse",
                                  ].join(" ")}
                                  title={`Last run: ${lastRun}`}
                                />
                                <p className="text-sm font-medium leading-snug flex-1 min-w-0">
                                  {item.title}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-normal">
                                {item.description || "—"}
                              </p>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                services {svcCount} · APIs {svcCount} · Last Run:{" "}
                                <span
                                  className={[
                                    "font-semibold",
                                    lastRun === "PASS"
                                      ? "text-success"
                                      : lastRun === "FAIL"
                                        ? "text-destructive"
                                        : "text-primary",
                                  ].join(" ")}
                                >
                                  {lastRun}
                                </span>{" "}
                                · {lastRunAgeMin}m ago
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-primary/10 text-primary border border-primary/25">
                                  Coverage {coverage}%
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-violet-500/10 text-violet-700 border border-violet-500/25">
                                  Edge +{edgeCases}
                                </span>
                                {isAi ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium bg-sky-500/10 text-sky-700 border border-sky-500/25">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    AI Generated
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-500/10 text-slate-700 border border-slate-500/25">
                                    Manual
                                  </span>
                                )}
                                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/25">
                                  Auto Validated
                                </span>
                              </div>
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
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openAsScenario(item);
                                }}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                                title="테스트케이스 생성"
                                disabled={openingId === item.id}
                              >
                                <Wand2 className="w-4 h-4" />
                              </button>
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
                            </div>
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
                    <FinixPrimaryButton
                      onClick={startCreate}
                      className="h-9 px-3 w-auto rounded-sm text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      이 컬렉션에 등록
                    </FinixPrimaryButton>
                  </div>
                  <div className="px-4 py-3 border-b border-border bg-background">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-sm">
                        <div className="text-[11px] text-muted-foreground">
                          Total Scenarios
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {scenarioMetrics.total}
                        </div>
                      </div>
                      <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-sm">
                        <div className="text-[11px] text-muted-foreground">
                          AI Generated
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {scenarioMetrics.aiRatio}%
                        </div>
                      </div>
                      <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-sm">
                        <div className="text-[11px] text-muted-foreground">
                          Success Rate
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {scenarioMetrics.successRate}%
                        </div>
                      </div>
                      <div className="rounded-sm border border-border bg-card px-3 py-2 shadow-sm">
                        <div className="text-[11px] text-muted-foreground">
                          Coverage
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {scenarioMetrics.coverage}%
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 border-b border-border bg-background hidden lg:flex items-center justify-end">
                    <button
                      type="button"
                      className="h-8 px-2 rounded-sm border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-flex items-center gap-2"
                      title={previewCollapsed ? "Preview 펼치기" : "Preview 접기"}
                      onClick={() => setPreviewCollapsed((v) => !v)}
                    >
                      {previewCollapsed ? (
                        <PanelRightOpen className="w-4 h-4" />
                      ) : (
                        <PanelRightClose className="w-4 h-4" />
                      )}
                      {previewCollapsed ? "Preview 열기" : "Preview 접기"}
                    </button>
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
                            const coverage =
                              60 + Math.min(35, (item.serviceSequence?.length ?? 0) * 8);
                            const edgeCases = Math.min(
                              9,
                              Math.max(0, (item.serviceSequence?.length ?? 0) - 1),
                            );
                            const isAi = item.tags.some((t) =>
                              t.toLowerCase().includes("ai"),
                            );
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
                                  <p className="text-[11px] text-muted-foreground font-mono mt-1">
                                    services {(item.serviceSequence ?? []).length}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-primary/10 text-primary border border-primary/25">
                                      Coverage {coverage}%
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-violet-500/10 text-violet-700 border border-violet-500/25">
                                      Edge +{edgeCases}
                                    </span>
                                    {isAi ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-medium bg-sky-500/10 text-sky-700 border border-sky-500/25">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        AI Generated
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-500/10 text-slate-700 border border-slate-500/25">
                                        Manual
                                      </span>
                                    )}
                                  </div>
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
                                      void openAsScenario(item);
                                    }}
                                    className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                                    title="테스트케이스 생성"
                                    disabled={openingId === item.id}
                                  >
                                    <Wand2 className="w-4 h-4" />
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
        <DialogContent className={`${FINIX_LARGE_MODAL_CONTENT} rounded-sm`}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left space-y-2">
            <DialogTitle className="pr-10 text-lg font-semibold">
              {editingId ? "시나리오 편집" : "시나리오 등록"}
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {scenarioWizardStep === 1
                  ? "1/2 서비스 · 테스트 케이스 조립"
                  : "2/2 제목·상태·컬렉션·설명"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div
            className={`px-6 py-4 flex-1 min-h-0 ${
              scenarioWizardStep === 1
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
                  label="서비스 추가"
                  helperText="코드 또는 이름으로 검색 후 선택 (시퀀스에 추가됩니다)"
                >
                  <ServiceCatalogCombobox
                    options={catalogOptions}
                    value={servicePickerCode}
                    onValueChange={handleServiceCatalogPick}
                    loading={catalogLoading}
                    disabled={catalogOptions.length === 0}
                  />
                </FinixField>

                <FinixField
                  label="서비스 시퀀스"
                  helperText="클릭하면 해당 서비스 테스트케이스 후보만 표시됩니다. 제거는 휴지통만 사용하세요."
                  className="shrink-0"
                >
                  <DndProvider backend={HTML5Backend}>
                    <div
                      className="space-y-2 max-h-[min(140px,18vh)] overflow-y-auto"
                      onPointerDown={() => {
                        if (document.activeElement instanceof HTMLElement) {
                          document.activeElement.blur();
                        }
                      }}
                    >
                      {serviceDrafts.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-border bg-muted/10 px-4 py-4 text-sm text-muted-foreground text-center">
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
            ) : (
              <>
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

