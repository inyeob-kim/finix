import { ApiError } from "@/api/client";
import {
  listTestCasesByServiceCode,
  materializeTestCasesForService,
  downloadServicePostmanCollection,
} from "@/api/testcaseApi";
import type { TestCaseReadDto } from "@/api/types";
import {
  compareTestCasesByCaseId,
  inferPathKindFromTestCase,
  testCaseMatchesQuery,
} from "@/lib/materializedTestCaseMeta";
import type { RulesMetaRunSession } from "./RulesMetaTestCaseRunDialog";
import { Download, Play, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmPopover } from "../scenarioRegistry/components/ConfirmPopover";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixUnderlineInput } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import { RulesMetaTestCasesTable } from "./RulesMetaTestCasesTable";

const ICON_BTN =
  "h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

const SECONDARY_BTN =
  "h-9 px-3 text-xs rounded-sm border border-border font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5";

type PathFilter = "" | "N" | "E";

type RulesMetaTestCasesPanelProps = {
  serviceCode: string;
  /** Bundle currently open in the YAML edit modal (for resume after detail). */
  resumeBundleId: number;
  /** Current editor YAML — used so macros in the open document are materialized. */
  yamlText?: string;
  /** Operating (active) YAML version for this service, if any. */
  activeBundleVersion?: number | null;
  /** True when the open modal bundle is a draft, not the active one. */
  editingDraft?: boolean;
  active?: boolean;
  disabled?: boolean;
  runningSingleId?: string | null;
  onRowsChange?: (rows: TestCaseReadDto[]) => void;
  registerRefresh?: (refresh: () => Promise<void>) => void;
  onRunSessionChange: (session: RulesMetaRunSession) => void;
};

export function RulesMetaTestCasesPanel({
  serviceCode,
  resumeBundleId,
  yamlText = "",
  activeBundleVersion = null,
  editingDraft = false,
  active = true,
  disabled = false,
  runningSingleId = null,
  onRowsChange,
  registerRefresh,
  onRunSessionChange,
}: RulesMetaTestCasesPanelProps) {
  const [rows, setRows] = useState<TestCaseReadDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pathFilter, setPathFilter] = useState<PathFilter>("");
  const [exportAllLoading, setExportAllLoading] = useState(false);

  const code = serviceCode.trim();
  const hasActiveYaml = activeBundleVersion != null;
  const onRowsChangeRef = useRef(onRowsChange);
  onRowsChangeRef.current = onRowsChange;

  const loadTestCases = useCallback(async () => {
    if (!code) {
      setRows([]);
      onRowsChangeRef.current?.([]);
      return;
    }
    setListLoading(true);
    try {
      const listed = await listTestCasesByServiceCode(code, 500);
      setRows(listed);
      onRowsChangeRef.current?.(listed);
    } catch (e) {
      setRows([]);
      onRowsChangeRef.current?.([]);
      toast.error(
        e instanceof ApiError
          ? e.message
          : "테스트 케이스를 불러오지 못했습니다.",
      );
    } finally {
      setListLoading(false);
    }
  }, [code]);

  useEffect(() => {
    registerRefresh?.(loadTestCases);
  }, [registerRefresh, loadTestCases]);

  useEffect(() => {
    if (!active || !code) return;
    setExpandedId(null);
    void loadTestCases();
  }, [active, code, loadTestCases]);

  const filteredRows = useMemo(() => {
    const list = rows.filter((r) => {
      if (pathFilter && inferPathKindFromTestCase(r) !== pathFilter) return false;
      return testCaseMatchesQuery(r, query);
    });
    return [...list].sort(compareTestCasesByCaseId);
  }, [rows, pathFilter, query]);

  const generateDisabledReason = (() => {
    if (!code) return "서비스를 선택하세요.";
    if (!yamlText.trim() && !hasActiveYaml) {
      return "YAML이 없습니다. 케이스 편집 탭에서 작성·저장한 뒤 생성하세요.";
    }
    if (disabled) return "다른 작업이 진행 중입니다.";
    if (generateLoading) return "풀에 반영 중입니다.";
    return null;
  })();

  const runGenerate = async () => {
    if (!code || generateDisabledReason) return;
    setReplaceConfirmOpen(false);
    setGenerateLoading(true);
    try {
      const created = await materializeTestCasesForService(code, {
        replace_existing: true,
        bundle_id: resumeBundleId,
        yaml_text: yamlText.trim() ? yamlText : null,
      });
      toast.success(`풀에 ${created.length}건을 반영했습니다.`);
      setRows(created);
      onRowsChangeRef.current?.(created);
      try {
        const listed = await listTestCasesByServiceCode(code, 500);
        if (listed.length > 0) {
          setRows(listed);
          onRowsChangeRef.current?.(listed);
        }
      } catch {
        // Keep `created` rows if refresh fails.
      }
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "테스트 케이스를 생성하지 못했습니다.",
      );
    } finally {
      setGenerateLoading(false);
    }
  };

  const requestGenerate = () => {
    if (generateDisabledReason) return;
    if (rows.length > 0) {
      setReplaceConfirmOpen(true);
      return;
    }
    void runGenerate();
  };

  const openRunDialog = (test: TestCaseReadDto) => {
    onRunSessionChange({ kind: "single", test });
  };

  const openRunAllDialog = () => {
    if (rows.length === 0 || disabled) return;
    onRunSessionChange({ kind: "all" });
  };

  const exportAllPostman = async () => {
    if (!code || rows.length === 0 || exportAllLoading) return;
    setExportAllLoading(true);
    try {
      await downloadServicePostmanCollection(code);
      toast.success(`Postman 컬렉션을 내보냈습니다. (${rows.length}건)`);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Postman 내보내기에 실패했습니다.",
      );
    } finally {
      setExportAllLoading(false);
    }
  };

  const emptyMessage = !yamlText.trim() && !hasActiveYaml
    ? "YAML이 없어 풀에 반영할 수 없습니다. 케이스 편집 탭에서 작성하세요."
    : rows.length === 0
      ? "풀에 적재된 테스트케이스가 없습니다. 「풀에 반영」으로 현재 YAML을 올리거나, 케이스 편집 ▶ 로 시험 실행하세요."
      : "검색 조건에 맞는 테스트케이스가 없습니다.";

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="rounded-sm border border-border bg-muted/20 p-3 space-y-2 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <div className="flex flex-col gap-1.5 min-w-0 lg:max-w-[min(100%,24rem)]">
            <p className="text-xs text-muted-foreground leading-snug">
              생성 기준:{" "}
              {yamlText.trim() ? (
                <span className="font-medium text-foreground">
                  현재 편집 중인 YAML
                </span>
              ) : hasActiveYaml ? (
                <span className="font-medium text-foreground">
                  적용된 YAML
                </span>
              ) : (
                <span className="font-medium text-destructive">적용된 YAML 없음</span>
              )}
              {editingDraft && yamlText.trim() ? (
                <span>
                  {" "}
                  · 「풀에 반영」 시 버전 갱신 · ▶ 는 시험 실행만 (버전 유지)
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <button
              type="button"
              className={SECONDARY_BTN}
              disabled={
                rows.length === 0 || disabled || listLoading
              }
              title={
                rows.length === 0
                  ? "실행할 테스트케이스가 없습니다."
                  : `풀 ${rows.length}건 전체 실행`
              }
              onClick={openRunAllDialog}
            >
              <Play className="w-3.5 h-3.5" />
              전체 실행
              {rows.length > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  · {rows.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={SECONDARY_BTN}
              disabled={
                rows.length === 0 ||
                disabled ||
                listLoading ||
                exportAllLoading
              }
              title={
                rows.length === 0
                  ? "내보낼 테스트케이스가 없습니다."
                  : `풀 ${rows.length}건 Postman 전체 내보내기`
              }
              onClick={() => void exportAllPostman()}
            >
              {exportAllLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              전체 Export
            </button>
            <ConfirmPopover
              open={replaceConfirmOpen}
              onOpenChange={setReplaceConfirmOpen}
              align="end"
              title="기존 테스트케이스를 교체할까요?"
              description={`현재 풀 ${rows.length}건을 삭제한 뒤 지금 편집 중인 YAML로 다시 반영합니다. ▶ 실행은 풀·버전을 바꾸지 않습니다.`}
              cancelLabel="취소"
              confirmLabel="풀에 반영"
              confirmClassName="h-8 px-3 rounded-sm bg-destructive text-destructive-foreground text-xs font-medium hover:opacity-90"
              onCancel={() => setReplaceConfirmOpen(false)}
              onConfirm={() => void runGenerate()}
              anchor={
                <span className="inline-flex shrink-0">
                  <FinixPrimaryButton
                    type="button"
                    className="h-9 px-3 text-xs rounded-sm w-auto gap-1.5"
                    disabled={Boolean(generateDisabledReason)}
                    title={
                      generateDisabledReason ??
                      "현재 YAML을 풀에 반영합니다 (버전 갱신)."
                    }
                    onClick={requestGenerate}
                  >
                    {generateLoading ? (
                      <FinixLoading size="sm" inline />
                    ) : null}
                    풀에 반영
                  </FinixPrimaryButton>
                </span>
              }
            />
            <button
              type="button"
              className={ICON_BTN}
              disabled={listLoading || !code || disabled}
              title="목록 새로고침"
              aria-label="목록 새로고침"
              onClick={() => void loadTestCases()}
            >
              {listLoading ? (
                <FinixLoading size="sm" inline />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center shrink-0">
        <div className="flex gap-1 rounded-sm border border-border p-0.5">
          {(
            [
              { id: "" as const, label: "전체" },
              { id: "N" as const, label: "N" },
              { id: "E" as const, label: "E" },
            ] as const
          ).map((t) => (
            <button
              key={t.id || "all"}
              type="button"
              className={cn(
                "h-8 px-3 text-xs rounded-sm",
                pathFilter === t.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => setPathFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <FinixUnderlineInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·case_id·엔드포인트 검색"
            className="pl-7"
          />
        </div>
        {query || pathFilter ? (
          <span className="text-xs text-muted-foreground">
            {filteredRows.length}/{rows.length}건
          </span>
        ) : null}
      </div>

      <RulesMetaTestCasesTable
        rows={filteredRows}
        listLoading={listLoading}
        emptyMessage={emptyMessage}
        expandedId={expandedId}
        onToggleExpand={(id) =>
          setExpandedId((prev) => (prev === id ? null : id))
        }
        runningId={runningSingleId}
        onRun={openRunDialog}
      />
    </div>
  );
}
