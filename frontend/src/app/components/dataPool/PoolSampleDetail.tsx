import { Link } from "react-router";
import type { PoolSampleDto } from "@/api/dataPoolApi";

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-muted-foreground">—</p>;
  }
  return (
    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto rounded-sm border border-border bg-muted/30 p-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

type Props = {
  detail: PoolSampleDto | null;
  promoting: boolean;
  onPromoteSelected: () => void;
  onPromoteService: () => void;
};

export function PoolSampleDetail({
  detail,
  promoting,
  onPromoteSelected,
  onPromoteService,
}: Props) {
  if (!detail) {
    return <p className="text-sm text-muted-foreground">샘플을 선택하세요.</p>;
  }
  return (
    <>
      <div className="space-y-1">
        <p className="text-sm font-medium font-mono">
          #{detail.id} · {detail.path_kind}
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          {detail.method} {detail.endpoint}
        </p>
        <p className="text-xs text-muted-foreground">
          service={detail.service_code ?? "—"} · status={detail.http_status ?? "—"} ·
          error={detail.biz_error_code ?? "—"}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">CbbHeader</p>
        <JsonBlock value={detail.cbb_header} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Request</p>
        <JsonBlock value={detail.request_body} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Response</p>
        <JsonBlock value={detail.response_body} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="h-9 px-3 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-50"
          disabled={promoting}
          onClick={onPromoteSelected}
        >
          {promoting ? "승격 중…" : "TC로 승격"}
        </button>
        {detail.service_code ? (
          <button
            type="button"
            className="h-9 px-3 rounded-sm border border-border text-sm hover:bg-muted disabled:opacity-50"
            disabled={promoting}
            onClick={onPromoteService}
          >
            서비스 일괄 승격
          </button>
        ) : null}
        <Link
          to="/scenario-registry"
          className="h-9 px-3 inline-flex items-center rounded-sm border border-border text-sm hover:bg-muted"
        >
          시나리오에서 사용
        </Link>
      </div>
    </>
  );
}
