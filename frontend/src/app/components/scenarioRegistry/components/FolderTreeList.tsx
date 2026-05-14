import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmPopover } from "./ConfirmPopover";
import type { ScenarioRegistryFolder } from "../types";

export type FolderOption = { id: string; label: string; depth: number };
export type FolderSummary = { count: number; successRate: number; lastUpdated: string };

export function FolderTreeList({
  folderOptions,
  folders,
  folderSummary,
  selectedFolderId,
  setSelectedFolderId,
  startCreateFolder,
  startEditFolder,
  removeFolder,
  applyDeleteFolder,
  confirmDeleteFolderId,
  setConfirmDeleteFolderId,
}: {
  folderOptions: FolderOption[];
  folders: ScenarioRegistryFolder[];
  folderSummary: Map<string, FolderSummary>;
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string) => void;
  startCreateFolder: (parentId: string | null) => void;
  startEditFolder: (id: string) => void;
  removeFolder: (id: string) => void;
  applyDeleteFolder: (idOverride?: string) => void;
  confirmDeleteFolderId: string | null;
  setConfirmDeleteFolderId: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      {folderOptions.map((f) => {
        const selected = f.id === selectedFolderId;
        return (
          <div
            key={f.id}
            className={[
              "flex items-center gap-2 rounded-sm px-2 py-2 transition-colors",
              selected
                ? "bg-muted text-foreground"
                : "hover:bg-muted/70 text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <button
              type="button"
              className="flex-1 flex items-center gap-2 text-left min-w-0"
              onClick={() => setSelectedFolderId(f.id)}
              title={f.label}
            >
              <ChevronRight
                className="w-3.5 h-3.5 opacity-60"
                style={{ marginLeft: `${f.depth * 10}px` }}
              />
              <span className="min-w-0">
                <div className="truncate text-sm">{f.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {(() => {
                    const s = folderSummary.get(f.id);
                    return s
                      ? `${s.count} scenarios · ${s.successRate}% · ${s.lastUpdated}`
                      : "—";
                  })()}
                </div>
              </span>
            </button>
            <button
              type="button"
              className="p-1.5 rounded-sm border border-transparent hover:bg-background hover:border-border text-muted-foreground hover:text-foreground"
              title="하위 컬렉션 추가"
              onClick={() => startCreateFolder(f.id)}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-sm border border-transparent hover:bg-background hover:border-border text-muted-foreground hover:text-foreground"
              title="이름/위치 변경"
              onClick={() => startEditFolder(f.id)}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <ConfirmPopover
              open={confirmDeleteFolderId === f.id}
              onOpenChange={(v) => {
                if (!v) setConfirmDeleteFolderId(null);
              }}
              anchor={
                <button
                  type="button"
                  className="p-1.5 rounded-sm border border-transparent hover:bg-background hover:border-border text-muted-foreground hover:text-destructive"
                  title="삭제"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFolder(f.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              }
              title="컬렉션을 삭제할까요?"
              description={folders.find((x) => x.id === f.id)?.name ?? "—"}
              onCancel={() => setConfirmDeleteFolderId(null)}
              onConfirm={() => applyDeleteFolder(f.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

