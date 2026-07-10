import { Link } from "react-router";
import { Play } from "lucide-react";

type Props = {
  hasSearch: boolean;
  presetLabel: string;
};

export function ExecutionHistoryEmptyState({
  hasSearch,
  presetLabel,
}: Props) {
  if (hasSearch) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        현재 조건에서 검색 결과가 없습니다. 검색어를 바꿔 보세요.
      </p>
    );
  }

  return (
    <div className="rounded-sm border border-dashed border-border bg-muted/20 px-6 py-10 text-center space-y-4">
      <p className="text-sm text-muted-foreground">
        {presetLabel} 구간에 실행 이력이 없습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        기간을 «전체» 또는 «최근 7일»로 바꾸거나, 시나리오 레지스트리에서
        실행해 보세요.
      </p>
      <Link
        to="/scenario-registry"
        className="inline-flex items-center gap-2 h-9 px-4 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
      >
        <Play className="w-4 h-4" />
        시나리오 실행하러 가기
      </Link>
    </div>
  );
}
