import type { BulkStatusDto } from "@/api/dataPoolApi";
import { cn } from "../ui/utils";

export function BulkConnectorStatus({ status }: { status: BulkStatusDto | null }) {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        status?.configured
          ? "border-emerald-500/25 bg-emerald-500/5 text-muted-foreground"
          : "border-amber-500/25 bg-amber-500/5 text-muted-foreground",
      )}
    >
      {status ? (
        <>
          <p className="text-foreground text-sm font-medium mb-1">
            {status.configured ? "Bulk Connector 연결됨" : "Bulk Connector 미설정"}
          </p>
          <p className="text-xs whitespace-pre-wrap">{status.message}</p>
          {status.configured ? (
            <p className="text-xs mt-1">
              {status.directory ? `파일 ${status.file_count}개 · ` : null}
              {status.url ? "URL 소스 사용 가능 · " : null}
              덤프를 비우고 실행하면 설정된 소스에서 자동 수집합니다.
            </p>
          ) : (
            <p className="text-xs mt-1">
              <code className="font-mono">LOG_BULK_SOURCE_DIR</code> 또는{" "}
              <code className="font-mono">LOG_BULK_SOURCE_URL</code> 을{" "}
              <code className="font-mono">backend/.env</code>에 설정하세요. 또는 아래에
              서버 덤프를 붙여넣으세요.
            </p>
          )}
        </>
      ) : (
        <p>Connector 상태 확인 중…</p>
      )}
    </div>
  );
}
