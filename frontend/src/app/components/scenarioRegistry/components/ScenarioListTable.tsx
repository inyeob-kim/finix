import { BarChart3, Download, Play, Plus, Trash2 } from "lucide-react";
import {
  canExportRegistryScenarioPostman,
  registryScenarioPostmanExportBlockReason,
} from "@/lib/registryScenarioExport";
import { canRunRegistryScenario } from "@/lib/registryScenarioRun";
import { FinixPrimaryButton } from "../../ui/finix-button";
import { FinixScenarioStatusBadge } from "../../ui/finix-status-badge";
import {
  FinixDataTable,
  FinixDataTableBody,
  FinixDataTableCell,
  FinixDataTableHead,
  FinixDataTableHeader,
  FinixDataTableRow,
  FINIX_DATA_TABLE_GHOST_BTN_CLASS,
  FINIX_DATA_TABLE_ICON_BTN_CLASS,
} from "../../ui/finix-data-table";
import { cn } from "../../ui/utils";
import type { ScenarioRegistryItem } from "../types";
import {
  resolveScenarioSaveStatus,
  scenarioSaveStatusToBadge,
} from "../wizardPersist";
import { ConfirmPopover } from "./ConfirmPopover";

export type ScenarioListEmptyCopy = {
  title: string;
  detail?: string | null;
  canRegister: boolean;
};

type ScenarioListTableProps = {
  items: ScenarioRegistryItem[];
  selectedScenarioId: string | null;
  emptyCopy: ScenarioListEmptyCopy;
  actions: "history" | "full";
  runningId: string | null;
  exportingId: string | null;
  confirmDeleteScenarioId: string | null;
  onSelectRow: (id: string) => void;
  onRegister: () => void;
  onOpenHistory: () => void;
  onRun: (item: ScenarioRegistryItem) => void;
  onExport: (item: ScenarioRegistryItem) => void;
  onRequestDelete: (id: string) => void;
  onConfirmDeleteOpenChange: (open: boolean, id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
};

export function ScenarioListTable({
  items,
  selectedScenarioId,
  emptyCopy,
  actions,
  runningId,
  exportingId,
  confirmDeleteScenarioId,
  onSelectRow,
  onRegister,
  onOpenHistory,
  onRun,
  onExport,
  onRequestDelete,
  onConfirmDeleteOpenChange,
  onConfirmDelete,
  onCancelDelete,
}: ScenarioListTableProps) {
  return (
    <FinixDataTable>
      <FinixDataTableHeader>
        <FinixDataTableRow className="hover:bg-transparent">
          <FinixDataTableHead className="min-w-[220px]">시나리오</FinixDataTableHead>
          <FinixDataTableHead className="w-[88px] whitespace-nowrap">
            상태
          </FinixDataTableHead>
          <FinixDataTableHead className="w-[100px] whitespace-nowrap">
            테스트케이스
          </FinixDataTableHead>
          <FinixDataTableHead>태그</FinixDataTableHead>
          <FinixDataTableHead>수정</FinixDataTableHead>
          <FinixDataTableHead>수정자</FinixDataTableHead>
          <FinixDataTableHead
            className={
              actions === "full" ? "w-[128px] text-left" : "w-[72px] text-right"
            }
          >
            작업
          </FinixDataTableHead>
        </FinixDataTableRow>
      </FinixDataTableHeader>
      <FinixDataTableBody>
        {items.length === 0 ? (
          <FinixDataTableRow>
            <FinixDataTableCell
              colSpan={7}
              className="py-12 text-center text-muted-foreground text-sm"
            >
              <div className="max-w-lg mx-auto space-y-4">
                <div className="text-sm font-medium text-foreground">
                  {emptyCopy.title}
                </div>
                {emptyCopy.detail ? (
                  <div className="text-sm text-muted-foreground">
                    {emptyCopy.detail}
                  </div>
                ) : null}
                {emptyCopy.canRegister ? (
                  <div className="flex items-center justify-center pt-1">
                    <FinixPrimaryButton
                      onClick={onRegister}
                      className="h-9 px-4 w-auto rounded-sm text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      시나리오 등록
                    </FinixPrimaryButton>
                  </div>
                ) : null}
              </div>
            </FinixDataTableCell>
          </FinixDataTableRow>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedScenarioId;
            const tcCount = item.selectedRuleTestcases?.length ?? 0;
            const saveStatus = resolveScenarioSaveStatus(item);
            return (
              <FinixDataTableRow
                key={item.id}
                interactive
                className={cn(
                  isSelected && "bg-primary/5 border-l-2 border-l-primary",
                )}
                onClick={() => onSelectRow(item.id)}
              >
                <FinixDataTableCell className="align-top whitespace-normal">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    {item.description?.trim() ? (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-normal">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </FinixDataTableCell>
                <FinixDataTableCell className="align-top">
                  <FinixScenarioStatusBadge
                    status={scenarioSaveStatusToBadge(saveStatus)}
                  />
                </FinixDataTableCell>
                <FinixDataTableCell className="align-top text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {tcCount}개
                </FinixDataTableCell>
                <FinixDataTableCell className="align-top text-xs text-muted-foreground">
                  {item.tags.slice(0, 2).join(", ") || "—"}
                </FinixDataTableCell>
                <FinixDataTableCell className="align-top text-xs text-muted-foreground whitespace-nowrap">
                  {item.updatedAt}
                </FinixDataTableCell>
                <FinixDataTableCell className="align-top text-xs text-muted-foreground font-mono">
                  {item.updatedBy}
                </FinixDataTableCell>
                <FinixDataTableCell
                  className={cn(
                    "align-top",
                    actions === "history" ? "text-right" : "text-left",
                  )}
                >
                  {actions === "history" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenHistory();
                      }}
                      className={FINIX_DATA_TABLE_ICON_BTN_CLASS}
                      aria-label="실행 이력"
                      title="실행 이력"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRun(item);
                        }}
                        disabled={
                          runningId === item.id ||
                          saveStatus === "draft" ||
                          !canRunRegistryScenario(item)
                        }
                        className={FINIX_DATA_TABLE_GHOST_BTN_CLASS}
                        title={
                          saveStatus === "draft"
                            ? "임시저장 시나리오는 완료 저장 후 실행할 수 있습니다"
                            : canRunRegistryScenario(item)
                              ? "시나리오 실행"
                              : "DB 테스트 케이스가 포함된 시나리오만 실행 가능"
                        }
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExport(item);
                        }}
                        disabled={
                          exportingId === item.id ||
                          saveStatus === "draft" ||
                          !canExportRegistryScenarioPostman(item)
                        }
                        className={FINIX_DATA_TABLE_GHOST_BTN_CLASS}
                        title={
                          canExportRegistryScenarioPostman(item)
                            ? "Postman 컬렉션 다운로드"
                            : (registryScenarioPostmanExportBlockReason(item) ??
                              "Postman export 불가")
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <ConfirmPopover
                        open={confirmDeleteScenarioId === item.id}
                        onOpenChange={(v) =>
                          onConfirmDeleteOpenChange(v, item.id)
                        }
                        anchor={
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRequestDelete(item.id);
                            }}
                            className={cn(
                              FINIX_DATA_TABLE_GHOST_BTN_CLASS,
                              "hover:text-destructive",
                            )}
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        }
                        title="시나리오를 삭제할까요?"
                        description={
                          <span className="line-clamp-2">{item.title}</span>
                        }
                        onCancel={onCancelDelete}
                        onConfirm={onConfirmDelete}
                      />
                    </div>
                  )}
                </FinixDataTableCell>
              </FinixDataTableRow>
            );
          })
        )}
      </FinixDataTableBody>
    </FinixDataTable>
  );
}
