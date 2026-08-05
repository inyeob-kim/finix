import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import type { ScenarioRunMode } from "@/lib/registryScenarioRun";
import { Settings2 } from "lucide-react";
import { ScenarioPostmanBaseUrlField } from "./ScenarioPostmanBaseUrlField";
import { FinixField } from "../ui/finix-form";

type Props = {
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  mode: ScenarioRunMode;
  onModeChange: (mode: ScenarioRunMode) => void;
  baseUrlHint?: string;
  /** Opens separate header-settings dialog (preferred over inline fields). */
  onOpenHeaderSettings?: () => void;
};

export function ScenarioRunDialogForm({
  postmanConfig,
  onPostmanConfigChange,
  mode,
  onModeChange,
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
      <FinixField label="실행 모드">
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="scenario-run-mode"
              checked={mode === "simulate"}
              onChange={() => onModeChange("simulate")}
              className="accent-primary"
            />
            시뮬레이션
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="scenario-run-mode"
              checked={mode === "live"}
              onChange={() => onModeChange("live")}
              className="accent-primary"
            />
            실행 API
          </label>
        </div>
      </FinixField>
      {baseUrlHint ? (
        <p className="text-xs text-muted-foreground">{baseUrlHint}</p>
      ) : null}
      {mode === "live" ? (
        <p className="text-xs text-muted-foreground">
          실행 API는 baseUrl과 공용 헤더 설정으로 실제 HTTP 요청을 보냅니다.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          시뮬레이션은 API 호출 없이 연결·기대값만 검증합니다.
        </p>
      )}
    </div>
  );
}
