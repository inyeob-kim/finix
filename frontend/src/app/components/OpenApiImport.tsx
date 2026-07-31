import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, FileJson2, RefreshCw } from "lucide-react";
import { ApiError } from "@/api/client";
import {
  importOpenApiDocument,
  listApiOperations,
  listOpenApiDocuments,
  type ApiOperationDto,
  type OpenApiDocumentDto,
  type OpenApiImportResultDto,
} from "@/api/dataPoolApi";
import { PAGE_SECTION_STACK_CLASS } from "@/lib/finixShellLayout";
import { PageShell } from "./PageShell";
import { FinixPrimaryButton } from "./ui/finix-button";
import { FinixUnderlineInput, FinixUnderlineTextarea } from "./ui/finix-form";
import { FinixLoading } from "./ui/finix-loading";

const SAMPLE_OPENAPI = `{
  "openapi": "3.0.3",
  "info": { "title": "FINIX Sample", "version": "1.0.0" },
  "paths": {
    "/example/service": {
      "post": {
        "operationId": "PY016",
        "summary": "Sample salary payment",
        "responses": { "200": { "description": "OK" } }
      }
    }
  }
}`;

export function OpenApiImport() {
  const [jsonText, setJsonText] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<OpenApiDocumentDto[]>([]);
  const [ops, setOps] = useState<ApiOperationDto[]>([]);
  const [importResult, setImportResult] = useState<OpenApiImportResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const [d, o] = await Promise.all([
        listOpenApiDocuments(),
        listApiOperations({ query: query.trim() || undefined, limit: 200 }),
      ]);
      setDocs(d);
      setOps(o);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setListLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const res = await importOpenApiDocument({
        document: parsed,
        name: name.trim() || undefined,
      });
      setImportResult(res);
      await refresh();
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError("JSON 형식이 올바르지 않습니다.");
      } else {
        setError(e instanceof ApiError ? e.message : "Import에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }, [jsonText, name, refresh]);

  return (
    <PageShell
      icon={<FileJson2 className="w-5 h-5" strokeWidth={2} />}
      title="API 스펙"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/rules"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-sm border border-border text-sm hover:bg-muted"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            YAML 규칙으로
          </Link>
          <button
            type="button"
            className="h-9 w-9 inline-flex items-center justify-center rounded-sm border border-border hover:bg-muted"
            aria-label="새로고침"
            onClick={() => void refresh()}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className={PAGE_SECTION_STACK_CLASS}>
        {error ? (
          <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
            {error}
          </div>
        ) : null}
        {importResult ? (
          <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm px-3 py-2">
            Import 완료: {importResult.name} · operations {importResult.operations_upserted}
            {importResult.reused_document ? " (동일 checksum 문서 재사용)" : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 flex-1">
          <div className="space-y-3 flex flex-col min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">OpenAPI JSON import</p>
              <button
                type="button"
                className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                onClick={() => setJsonText(SAMPLE_OPENAPI)}
              >
                샘플 삽입
              </button>
            </div>
            <FinixUnderlineInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="문서 이름 (선택, 기본: info.title)"
            />
            <FinixUnderlineTextarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={16}
              spellCheck={false}
              className="min-h-[260px] font-mono text-[12px] flex-1"
              placeholder='{ "openapi": "3.0.3", "paths": { ... } }'
            />
            <FinixPrimaryButton
              type="button"
              className="h-9 px-4 w-auto self-start"
              disabled={loading || !jsonText.trim()}
              onClick={() => void onImport()}
            >
              {loading ? <FinixLoading size="sm" inline /> : null}
              Import
            </FinixPrimaryButton>
          </div>

          <div className="space-y-3 min-h-0 flex flex-col">
            <div className="flex flex-wrap gap-2 items-end">
              <FinixUnderlineInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void refresh();
                }}
                placeholder="path / operationId / service_code"
                className="flex-1"
              />
              <button
                type="button"
                className="h-9 px-3 rounded-sm border border-border text-sm hover:bg-muted"
                onClick={() => void refresh()}
              >
                검색
              </button>
            </div>

            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground space-y-1 shrink-0">
              <p className="font-medium text-foreground text-sm">Imported documents</p>
              {listLoading ? (
                <FinixLoading size="sm" inline />
              ) : docs.length === 0 ? (
                <p>아직 import된 문서가 없습니다.</p>
              ) : (
                docs.map((d) => (
                  <p key={d.id} className="font-mono">
                    #{d.id} {d.name}
                    {d.version ? ` v${d.version}` : ""} · ops≈{d.operation_count}
                  </p>
                ))
              )}
            </div>

            <div className="rounded-md border border-border overflow-auto flex-1 min-h-[200px]">
              {listLoading ? (
                <div className="flex justify-center py-12">
                  <FinixLoading label="불러오는 중…" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Path</th>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Operation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => (
                      <tr key={op.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{op.method}</td>
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[12rem]">
                          {op.path}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{op.service_code ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-[8rem]">
                          {op.operation_id ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
