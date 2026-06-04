import type { ScenarioPostmanConfig } from "@/lib/scenarioPostmanVariables";
import { ScenarioPostmanBaseUrlField } from "./ScenarioPostmanBaseUrlField";
import { ScenarioPostmanExportFilenameField } from "./ScenarioPostmanExportFilenameField";

type Props = {
  postmanConfig: ScenarioPostmanConfig;
  onPostmanConfigChange: (next: ScenarioPostmanConfig) => void;
  filename: string;
  onFilenameChange: (value: string) => void;
  defaultFilename: string;
  baseUrlHint?: string;
};

export function ScenarioPostmanExportDialogForm({
  postmanConfig,
  onPostmanConfigChange,
  filename,
  onFilenameChange,
  defaultFilename,
  baseUrlHint,
}: Props) {
  return (
    <div className="space-y-3">
      <ScenarioPostmanBaseUrlField
        config={postmanConfig}
        onChange={onPostmanConfigChange}
      />
      <ScenarioPostmanExportFilenameField
        value={filename}
        onChange={onFilenameChange}
        defaultName={defaultFilename}
      />
      {baseUrlHint ? (
        <p className="text-[10px] text-muted-foreground">{baseUrlHint}</p>
      ) : null}
    </div>
  );
}
