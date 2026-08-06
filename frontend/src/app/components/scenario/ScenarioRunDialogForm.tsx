import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { Settings2 } from "lucide-react";
import { ScenarioPostmanBaseUrlField } from "./ScenarioPostmanBaseUrlField";

type Props = {
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  baseUrlHint?: string;
  /** Opens separate header-settings dialog (preferred over inline fields). */
  onOpenHeaderSettings?: () => void;
};

export function ScenarioRunDialogForm({
  postmanConfig,
  onPostmanConfigChange,
  baseUrlHint,
  onOpenHeaderSettings,
}: Props) {
  return (
    <div className="space-y-3">
      <ScenarioPostmanBaseUrlField
        config={postmanConfig}
        onChange={onPostmanConfigChange}
      />
      {onOpenHeaderSettings ? (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border/60 bg-muted/10 px-2.5 py-2">
          <p className="text-xs text-muted-foreground min-w-0">
            채널 헤더 변수는 공용 설정에서 관리합니다.
          </p>
          <button
            type="button"
            className="shrink-0 h-8 px-2.5 rounded-sm border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
            onClick={onOpenHeaderSettings}
          >
            <Settings2 className="w-3.5 h-3.5" />
            헤더 설정
          </button>
        </div>
      ) : null}
      {baseUrlHint ? (
        <p className="text-xs text-muted-foreground">{baseUrlHint}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        baseUrl과 공용 헤더 설정으로 실제 HTTP 요청을 보냅니다.
      </p>
    </div>
  );
}
