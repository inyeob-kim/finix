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
  Loader2,
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
import { useAuthStore } from "../auth/authStore";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";
import { SERVICE_CATALOG, SERVICE_ITEM_TYPE } from "./scenarioRegistry/constants";
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
import { listTestCasesByServiceCode } from "../../api/testcaseApi";
import type { TestCaseReadDto } from "../../api/types";

function mapPersistedTestcaseToRef(
  row: TestCaseReadDto,
  serviceCode: string,
  serviceName: string,
): ScenarioRuleTestcaseRef {
  const prefix = `${serviceCode} `;
  let ruleId: string | undefined;
  if (row.name.startsWith(prefix)) {
    const rest = row.name.slice(prefix.length).trim();
    const firstSpace = rest.indexOf(" ");
    ruleId = firstSpace > 0 ? rest.slice(0, firstSpace) : rest || undefined;
  }
  return {
    id: `tc-${row.id}`,
    serviceCode,
    serviceName,
    ruleId,
    title: row.name,
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
  const [serviceQuery, setServiceQuery] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [status, setStatus] = useState<RegistryStatus>("draft");
  const [folderId, setFolderId] = useState<string>("");
  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([]);
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [serviceSearchIndex, setServiceSearchIndex] = useState(0);
  const [scenarioWizardStep, setScenarioWizardStep] = useState<1 | 2>(1);
  const [rulePickLoading, setRulePickLoading] = useState(false);
  const [allYamlRuleRefs, setAllYamlRuleRefs] = useState<ScenarioRuleTestcaseRef[]>(
    [],
  );
  const [selectedRulePicks, setSelectedRulePicks] = useState<
    ScenarioRuleTestcaseRef[]
  >([]);
  const [hydrated, setHydrated] = useState(false);

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

  const leftRulePool = useMemo(
    () => allYamlRuleRefs.filter((r) => !selectedRuleIdSet.has(r.id)),
    [allYamlRuleRefs, selectedRuleIdSet],
  );

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
    setServiceQuery("");
    setDescription("");
    setTagsText("");
    setStatus("draft");
    setFolderId(selectedFolderId ?? folders[0]?.id ?? "");
    setServiceDrafts([]);
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
    setServiceQuery("");
    setDescription(item.description);
    setTagsText(item.tags.join(", "));
    setStatus(item.status);
    setFolderId(item.folderId);
    setServiceDrafts(
      (item.serviceSequence ?? []).map((s) => ({
        id: newId(),
        code: s.code,
        name: s.name,
      })),
    );
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

  const matchedServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return SERVICE_CATALOG.slice(0, 20);
    return SERVICE_CATALOG.filter(
      (s) =>
        s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    ).slice(0, 20);
  }, [serviceQuery]);

  useEffect(() => {
    const openNow = serviceQuery.trim().length > 0 && matchedServices.length > 0;
    setServiceSearchOpen(openNow);
    if (openNow) {
      setServiceSearchIndex(0);
    }
  }, [serviceQuery, matchedServices.length]);

  const addService = (svc: ServiceCatalogItem) => {
    setServiceDrafts((prev) => {
      if (prev.some((p) => p.code === svc.code)) return prev;
      return [...prev, { id: newId(), code: svc.code, name: svc.name }];
    });
    setServiceQuery("");
  };

  const moveService = (dragIndex: number, hoverIndex: number) => {
    setServiceDrafts((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(hoverIndex, 0, removed);
      return next;
    });
  };

  const removeService = (id: string) => {
    setServiceDrafts((prev) => prev.filter((s) => s.id !== id));
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
        <DialogContent className="w-full max-h-[92vh] overflow-hidden flex flex-col sm:max-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0 rounded-sm">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left space-y-2">
            <DialogTitle className="pr-10">
              {editingId ? "시나리오 편집" : "시나리오 등록"}
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {scenarioWizardStep === 1
                  ? "1/2 서비스 검색 · 적재된 테스트 케이스 조립"
                  : "2/2 제목·상태·컬렉션·설명"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 flex-1 min-h-0 overflow-y-auto">
            {scenarioWizardStep === 1 ? (
              <div className="space-y-6">
                <FinixField
                  label="서비스 시퀀스(드래그로 순서 변경)"
                  helperText="서비스를 추가하고, 그립을 드래그해 순서를 바꾸세요."
                >
                  <DndProvider backend={HTML5Backend}>
                    <div className="space-y-3">
                      <Popover
                        open={serviceSearchOpen}
                        onOpenChange={(v) => setServiceSearchOpen(v)}
                      >
                        <PopoverAnchor asChild>
                          <div className="relative">
                            <FinixUnderlineInput
                              value={serviceQuery}
                              onChange={(e) => setServiceQuery(e.target.value)}
                              onFocus={() => {
                                if (
                                  serviceQuery.trim() &&
                                  matchedServices.length > 0
                                ) {
                                  setServiceSearchOpen(true);
                                }
                              }}
                              placeholder="서비스 검색 (예: PY016 / 계좌해지)"
                              className="pr-3"
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (matchedServices.length === 0) return;
                                  setServiceSearchIndex((prev) =>
                                    Math.min(
                                      matchedServices.length - 1,
                                      prev + 1,
                                    ),
                                  );
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (matchedServices.length === 0) return;
                                  setServiceSearchIndex((prev) =>
                                    Math.max(0, prev - 1),
                                  );
                                  return;
                                }
                                if (e.key === "Enter") {
                                  const picked =
                                    matchedServices[serviceSearchIndex] ??
                                    matchedServices[0];
                                  if (picked) {
                                    e.preventDefault();
                                    addService(picked);
                                  }
                                }
                                if (e.key === "Escape") {
                                  setServiceQuery("");
                                  setServiceSearchOpen(false);
                                }
                              }}
                            />
                          </div>
                        </PopoverAnchor>
                        <PopoverContent
                          align="start"
                          className="w-[min(720px,calc(100vw-3rem))] p-0 rounded-sm border border-border shadow-lg"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <div className="max-h-[280px] overflow-y-auto">
                            {matchedServices.map((s) => {
                              const selected = serviceDrafts.some(
                                (x) => x.code === s.code,
                              );
                              const idx = matchedServices.findIndex(
                                (m) => m.code === s.code,
                              );
                              const isActive = idx === serviceSearchIndex;
                              return (
                                <button
                                  key={s.code}
                                  type="button"
                                  onClick={() => addService(s)}
                                  className={[
                                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3",
                                    "border-b border-border last:border-b-0",
                                    isActive ? "bg-muted/70" : "",
                                    selected
                                      ? "bg-muted text-foreground"
                                      : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                                  ].join(" ")}
                                >
                                  <span className="font-mono text-xs">
                                    {s.code}
                                  </span>
                                  <span className="flex-1 truncate">{s.name}</span>
                                  <span className="text-xs">
                                    {selected ? "추가됨" : "추가"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {serviceDrafts.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground text-center">
                          서비스가 없습니다. 위에서 검색 후 추가하세요.
                        </div>
                      ) : (
                        serviceDrafts.map((s, idx) => (
                          <ServiceRow
                            key={s.id}
                            svc={s}
                            index={idx}
                            move={moveService}
                            remove={removeService}
                          />
                        ))
                      )}
                    </div>
                  </DndProvider>
                </FinixField>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[220px]">
                  <div
                    className="rounded-sm border border-border bg-card/40 flex flex-col min-h-[200px]"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = parseDragRuleId(e);
                      if (id) removeRuleFromSelected(id);
                    }}
                  >
                    <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      테스트 케이스 후보 (DB 적재)
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[min(40vh,320px)] p-2">
                      {rulePickLoading ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          목록 불러오는 중…
                        </div>
                      ) : leftRulePool.length === 0 ? (
                        <div className="text-sm text-muted-foreground px-2 py-6 text-center">
                          {serviceDrafts.length === 0
                            ? "먼저 서비스를 추가하세요."
                            : "해당 서비스에 적재된 테스트 케이스가 없거나 API를 불러올 수 없습니다."}
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {leftRulePool.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/json",
                                    JSON.stringify({ id: r.id }),
                                  );
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onClick={() => addRuleToSelected(r)}
                                className="w-full text-left rounded-sm border border-transparent hover:border-border hover:bg-muted/50 px-2 py-2 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-[11px] text-primary shrink-0">
                                    {r.serviceCode}
                                  </span>
                                  {r.ruleType ? (
                                    <span className="text-[10px] uppercase text-muted-foreground shrink-0">
                                      {r.ruleType}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="font-medium text-foreground mt-0.5 line-clamp-2">
                                  {r.title}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  {r.ruleId?.trim()
                                    ? r.ruleId
                                    : r.backendTestcaseId != null
                                      ? `id=${r.backendTestcaseId}`
                                      : "—"}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
                      클릭하거나 오른쪽으로 드래그해 포함할 테스트를 고르세요.
                    </p>
                  </div>

                  <div
                    className="rounded-sm border border-dashed border-primary/25 bg-primary/[0.03] flex flex-col min-h-[200px]"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = parseDragRuleId(e);
                      const row =
                        leftRulePool.find((x) => x.id === id) ??
                        allYamlRuleRefs.find((x) => x.id === id);
                      if (row) addRuleToSelected(row);
                    }}
                  >
                    <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                      시나리오에 포함 ({selectedRulePicks.length})
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[min(40vh,320px)] p-2">
                      {selectedRulePicks.length === 0 ? (
                        <div className="text-sm text-muted-foreground px-2 py-6 text-center">
                          왼쪽에서 항목을 클릭하거나 여기로 드래그하세요.
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {selectedRulePicks.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    "application/json",
                                    JSON.stringify({ id: r.id }),
                                  );
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onClick={() => removeRuleFromSelected(r.id)}
                                className="w-full text-left rounded-sm border border-border bg-background px-2 py-2 text-xs hover:bg-muted/40"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-[11px] text-primary shrink-0">
                                    {r.serviceCode}
                                  </span>
                                  <ChevronLeft className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                                </div>
                                <div className="font-medium text-foreground mt-0.5 line-clamp-2">
                                  {r.title}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  {r.ruleId?.trim()
                                    ? r.ruleId
                                    : r.backendTestcaseId != null
                                      ? `id=${r.backendTestcaseId}`
                                      : "—"}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
                      클릭하면 왼쪽으로 되돌립니다. 왼쪽 패널로 드래그해도 됩니다.
                    </p>
                  </div>
                </div>
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
        <DialogContent className="w-full max-h-[92vh] overflow-y-auto sm:max-w-[min(56rem,calc(100vw-2rem))] rounded-sm">
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

