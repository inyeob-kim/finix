import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, Copy, GitPullRequest, Pencil } from "lucide-react";
import {
  getServiceRulesBundle,
  listServiceRulesVersions,
} from "@/api/serviceRulesApi";
import { ApiError } from "@/api/client";
import type { ServiceRuleBundleReadDto } from "@/api/types";
import type { RuleRegistryItem } from "@/hooks/useRulesRegistry";
import { FINIX_LARGE_MODAL_CONTENT } from "@/lib/finixModalLayout";
import { FinixLoading } from "../ui/finix-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { RulesMetaBundleDelete } from "./RulesMetaBundleDelete";

type Props = {
  item: RuleRegistryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditVersion: (bundleId: number) => void;
  onRefreshRegistry: () => Promise<void>;
};

function statusBadge(status: string, isActive: boolean) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
        <BadgeCheck className="w-3 h-3" />
        Active
      </span>
    );
  }
  const st = (status || "draft").toLowerCase();
  if (st === "superseded") {
    return <span className="text-[11px] text-muted-foreground">Superseded</span>;
  }
  if (st === "approved") {
    return <span className="text-[11px] text-muted-foreground">Approved</span>;
  }
  if (st === "active") {
    return <span className="text-[11px] text-amber-700 dark:text-amber-400">Active (stale)</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-primary">
      <GitPullRequest className="w-3 h-3" />
      Draft
    </span>
  );
}

function formatAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso)
    .toLocaleString("sv-SE", { hour12: false })
    .replace("T", " ");
}

export function RulesMetaHistoryDialog({
  item,
  open,
  onOpenChange,
  onEditVersion,
  onRefreshRegistry,
}: Props) {
  const [versions, setVersions] = useState<ServiceRuleBundleReadDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewYaml, setPreviewYaml] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [yamlCopyDone, setYamlCopyDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const code = item?.serviceCode ?? "";
  const activeVersion = item?.activeBundleVersion ?? null;

  const loadVersions = useCallback(async () => {
    if (!code) return [];
    const rows = await listServiceRulesVersions(code);
    setVersions(rows);
    return rows;
  }, [code]);

  useEffect(() => {
    if (!open || !code) return;
    setSelectedId(null);
    setPreviewYaml("");
    setYamlCopyDone(false);
    setNotice(null);
    setError(null);
    setListLoading(true);
    void loadVersions()
      .then((rows) => {
        if (rows.length > 0) setSelectedId(rows[0].id);
      })
      .catch((e) => {
        setVersions([]);
        setError(
          e instanceof ApiError ? e.message : "버전 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => setListLoading(false));
  }, [open, code, loadVersions]);

  useEffect(() => {
    if (!open || !code || selectedId == null) return;
    let cancelled = false;
    setPreviewLoading(true);
    void getServiceRulesBundle(code, selectedId)
      .then((b) => {
        if (!cancelled) setPreviewYaml(b.yaml_text ?? "");
      })
      .catch((e) => {
        if (!cancelled) {
          setPreviewYaml("");
          setError(
            e instanceof ApiError ? e.message : "YAML 미리보기를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, code, selectedId]);

  useEffect(() => {
    setYamlCopyDone(false);
  }, [selectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const selectedIsActive = Boolean(selected?.is_active);

  const refreshAll = async () => {
    const rows = await loadVersions();
    await onRefreshRegistry();
    return rows;
  };

  const handleDeleted = async () => {
    const rows = await refreshAll();
    if (rows.length === 0) {
      onOpenChange(false);
      return;
    }
    const next = rows.find((v) => v.id !== selectedId) ?? rows[0];
    setSelectedId(next.id);
    setNotice(`v${next.version} (#${next.id}) 로 전환했습니다.`);
  };

  const copyPreviewYaml = async () => {
    if (!previewYaml.trim()) return;
    try {
      await navigator.clipboard.writeText(previewYaml);
      setYamlCopyDone(true);
      window.setTimeout(() => setYamlCopyDone(false), 2000);
    } catch {
      setError("클립보드에 복사하지 못했습니다.");
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FINIX_LARGE_MODAL_CONTENT}>
        <DialogHeader className="px-6 pt-6 pb-4 pr-10 border-b border-border shrink-0 text-left">
          <DialogTitle className="text-lg font-semibold">
            버전 이력 — {item.serviceName}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-mono">{item.serviceCode}</span>
            {activeVersion != null ? (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <BadgeCheck className="w-3.5 h-3.5" />
                Active v{activeVersion}
              </span>
            ) : null}
            <span className="ml-2">
              · 총 {versions.length > 0 ? versions.length : item.versionCount}개 버전
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(260px,34%)_minmax(0,1fr)] overflow-hidden">
          <div className="min-h-0 min-w-0 pl-6 pr-4 pt-4 pb-4 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto max-h-[36vh] lg:max-h-full">
            {listLoading ? (
              <div className="p-8 flex justify-center">
                <FinixLoading size="md" label="불러오는 중…" inline />
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">버전</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                    <TableHead className="text-xs">#id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => {
                    const isActiveRow = Boolean(v.is_active);
                    const sel = v.id === selectedId;
                    return (
                      <TableRow
                        key={v.id}
                        className={`cursor-pointer ${sel ? "bg-primary/10" : "hover:bg-muted/50"}`}
                        onClick={() => setSelectedId(v.id)}
                      >
                        <TableCell className="font-mono text-sm py-2">
                          v{v.version}
                        </TableCell>
                        <TableCell className="py-2">
                          {statusBadge(v.status, isActiveRow)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground py-2">
                          {v.id}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="min-h-0 min-w-0 flex flex-col gap-2 pl-4 pr-6 pt-4 pb-4 overflow-hidden min-h-[min(280px,42vh)] lg:min-h-0">
            {selected ? (
              <p className="text-xs text-muted-foreground shrink-0 break-words">
                v{selected.version} · {(selected.status || "draft").toLowerCase()} ·
                #{selected.id}
                {selected.created_by ? ` · ${selected.created_by}` : ""}
                {" · "}
                {formatAt(selected.updated_at ?? selected.created_at)}
              </p>
            ) : null}
            <div className="flex-1 min-h-0 min-w-0 flex flex-col rounded-sm border border-border bg-muted/20 overflow-hidden">
              <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-border bg-muted/40 shrink-0">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  disabled={previewLoading || !previewYaml.trim()}
                  aria-label={yamlCopyDone ? "복사됨" : "YAML 복사"}
                  title={yamlCopyDone ? "복사됨" : "YAML 복사"}
                  onClick={() => void copyPreviewYaml()}
                >
                  {yamlCopyDone ? (
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              {previewLoading ? (
                <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                  <FinixLoading size="sm" label="YAML 불러오는 중…" inline />
                </div>
              ) : (
                <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {previewYaml || "(비어 있음)"}
                </pre>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-wrap gap-2">
          {notice ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 w-full text-left">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive w-full text-left">{error}</p>
          ) : null}
          {selected ? (
            <RulesMetaBundleDelete
              serviceCode={code}
              bundleId={selected.id}
              bundleVersion={selected.version}
              status={selectedIsActive ? "active" : selected.status}
              disabled={listLoading}
              onError={setError}
              onDeleted={handleDeleted}
            />
          ) : null}
          <button
            type="button"
            className="h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
            disabled={selectedId == null}
            onClick={() => {
              if (selectedId == null) return;
              onOpenChange(false);
              onEditVersion(selectedId);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            이 버전으로 편집
          </button>
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
