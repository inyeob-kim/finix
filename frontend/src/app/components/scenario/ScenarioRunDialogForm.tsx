import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import type { ScenarioRunMode } from "@/lib/registryScenarioRun";
import { ScenarioPostmanBaseUrlField } from "./ScenarioPostmanBaseUrlField";
import { FinixField } from "../ui/finix-form";

type Props = {
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  mode: ScenarioRunMode;
  onModeChange: (mode: ScenarioRunMode) => void;
  baseUrlHint?: string;
};

export function ScenarioRunDialogForm({
  postmanConfig,
  onPostmanConfigChange,
  mode,
  onModeChange,
  baseUrlHint,
}: Props) {
  return (
    <div className="space-y-3">
      <ScenarioPostmanBaseUrlField
        config={postmanConfig}
        onChange={onPostmanConfigChange}
      />
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
          실행 API는 baseUrl과 컬렉션 헤더로 실제 HTTP 요청을 보냅니다.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          시뮬레이션은 API 호출 없이 연결·기대값만 검증합니다.
        </p>
      )}
    </div>
  );
}
