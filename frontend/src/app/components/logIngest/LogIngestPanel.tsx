import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import {
  bulkIngestLogs,
  commitLogExchanges,
  getBulkStatus,
  parseLogText,
  type BulkStatusDto,
  type LogCommitResultDto,
  type ParsedExchangeDto,
} from "@/api/dataPoolApi";
import { BulkConnectorStatus } from "./BulkConnectorStatus";
import { FinixPrimaryButton } from "../ui/finix-button";
import { FinixUnderlineInput, FinixUnderlineTextarea } from "../ui/finix-form";
import { FinixLoading } from "../ui/finix-loading";
import { cn } from "../ui/utils";
import { FileUp, Server } from "lucide-react";

type IngestSubTab = "bulk" | "paste";

const SAMPLE_JSON = `{
  "exchanges": [
    {
      "method": "POST",
      "endpoint": "/example/service",
      "http_status": 200,
      "service_code": "PY016",
      "cbb_header": { "staffId": "1100000001", "txDt": "20260730", "srvcCd": "PY016" },
      "request_body": { "custId": "C001" },
      "response_body": { "txDt": "20260730" }
    },
    {
      "method": "POST",
      "endpoint": "/example/service",
      "http_status": 500,
      "service_code": "PY016",
      "request_body": { "custId": null },
      "response_body": { "messageId": "E_INVALID_ACCT" }
    }
  ]
}`;

type Props = {
  /** Called after a successful commit so the parent can refresh the sample list. */
  onCommitted?: () => void;
};

/** Log paste / bulk ingest UI — embedded inside Data Pool. */
export function LogIngestPanel({ onCommitted }: Props) {
  const [tab, setTab] = useState<IngestSubTab>("paste");
  const [text, setText] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [bulkDump, setBulkDump] = useState("");
  const [preview, setPreview] = useState<ParsedExchangeDto[] | null>(null);
  const [stats, setStats] = useState<{ happy: number; negative: number } | null>(
    null,
  );
  const [commitResult, setCommitResult] = useState<LogCommitResultDto | null>(
    null,
  );
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<BulkStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "bulk") return;
    let cancelled = false;
    (async () => {
      try {
        const status = await getBulkStatus();
        if (!cancelled) setBulkStatus(status);
      } catch {
        if (!cancelled) setBulkStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    setPreview(null);
    setStats(null);
    setCommitResult(null);
    setError(null);
    setBulkMessage(null);
  }, [tab]);

  const onParse = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCommitResult(null);
    try {
      const res = await parseLogText(text);
      setPreview(res.exchanges);
      setStats({ happy: res.happy_count, negative: res.negative_count });
    } catch (e) {
      setPreview(null);
      setStats(null);
      setError(e instanceof ApiError ? e.message : "파싱에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [text]);

  const onCommit = useCallback(async () => {
    if (!preview?.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await commitLogExchanges({
        exchanges: preview,
        source: "paste",
      });
      setCommitResult(res);
      onCommitted?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "적재에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [preview, onCommitted]);

  const onBulk = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBulkMessage(null);
    setCommitResult(null);
    try {
      const res = await bulkIngestLogs({
        service_code: serviceCode.trim() || undefined,
        log_text: bulkDump.trim() || undefined,
      });
      setBulkMessage(res.message);
      if (res.commit) {
        setCommitResult(res.commit);
        onCommitted?.();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bulk 수집에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [bulkDump, serviceCode, onCommitted]);

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex gap-1 border-b border-border shrink-0">
        {(
          [
            { id: "paste" as const, label: "붙여넣기", icon: FileUp },
            { id: "bulk" as const, label: "서버 수집", icon: Server },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-3 py-2">
          {error}
        </div>
      ) : null}
      {bulkMessage ? (
        <div className="rounded-sm border border-border bg-muted/40 text-sm px-3 py-2 whitespace-pre-wrap">
          {bulkMessage}
        </div>
      ) : null}
      {commitResult ? (
        <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-sm px-3 py-2">
          Data Pool 반영: 신규 {commitResult.created} · 갱신 {commitResult.updated}{" "}
          · 합계 {commitResult.total}
        </div>
      ) : null}

      {tab === "paste" ? (
        <div className="space-y-4 min-h-0 flex flex-col flex-1">
          <p className="text-xs text-muted-foreground">
            JSON exchanges 배열 또는 HTTP 메서드/경로가 포함된 로그 텍스트를
            붙여넣으세요.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setText(SAMPLE_JSON)}
            >
              샘플 삽입
            </button>
          </p>
          <FinixUnderlineTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            spellCheck={false}
            className="min-h-[220px] font-mono text-[12px]"
            placeholder='{ "exchanges": [ ... ] }'
          />
          <div className="flex flex-wrap gap-2">
            <FinixPrimaryButton
              type="button"
              className="h-9 px-4 w-auto"
              disabled={loading || !text.trim()}
              onClick={() => void onParse()}
            >
              {loading ? <FinixLoading size="sm" inline /> : null}
              파싱 미리보기
            </FinixPrimaryButton>
            <FinixPrimaryButton
              type="button"
              className="h-9 px-4 w-auto"
              disabled={loading || !preview?.length}
              onClick={() => void onCommit()}
            >
              Data Pool에 적재
            </FinixPrimaryButton>
          </div>
          {stats ? (
            <p className="text-xs text-muted-foreground">
              미리보기 {preview?.length ?? 0}건 · Happy {stats.happy} · Negative{" "}
              {stats.negative}
            </p>
          ) : null}
          {preview && preview.length > 0 ? (
            <div className="rounded-md border border-border overflow-auto max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Endpoint</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Service</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => (
                    <tr
                      key={`${row.endpoint}-${idx}`}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.path_kind}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.method}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[14rem]">
                        {row.endpoint}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.http_status ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.service_code ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.biz_error_code ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <BulkConnectorStatus status={bulkStatus} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs">
              <span className="text-muted-foreground">서비스 코드 (선택)</span>
              <FinixUnderlineInput
                value={serviceCode}
                onChange={(e) => setServiceCode(e.target.value)}
                placeholder="예: PY016"
              />
            </label>
          </div>
          <FinixUnderlineTextarea
            value={bulkDump}
            onChange={(e) => setBulkDump(e.target.value)}
            rows={12}
            spellCheck={false}
            className="min-h-[200px] font-mono text-[12px]"
            placeholder="서버 로그 덤프 (선택). Connector가 설정되어 있으면 비워도 됩니다."
          />
          <FinixPrimaryButton
            type="button"
            className="h-9 px-4 w-auto"
            disabled={loading}
            onClick={() => void onBulk()}
          >
            {loading ? <FinixLoading size="sm" inline /> : null}
            서버 수집 실행
          </FinixPrimaryButton>
        </div>
      )}
    </div>
  );
}
