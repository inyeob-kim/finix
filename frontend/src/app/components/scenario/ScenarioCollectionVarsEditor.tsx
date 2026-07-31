import {
  splitStartVarsForUi,
  updateHeaderVarValue,
  type PostmanStartVar,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import { FinixUnderlineInput } from "../ui/finix-form";

type Props = {
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
};

function HeaderVarRow({
  row,
  onValueChange,
}: {
  row: PostmanStartVar;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2 items-center">
      <span className="font-mono text-xs w-[4.5rem] shrink-0 text-muted-foreground">
        {row.key}
      </span>
      <FinixUnderlineInput
        value={row.value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="값"
        className="font-mono text-xs flex-1"
      />
    </div>
  );
}

/** BXM channel fields for x-bxm-systemheader. */
export function ScenarioCollectionVarsEditor({ config, onChange }: Props) {
  const { channelVars } = splitStartVarsForUi(config);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        <span className="font-mono">instCd</span> 등 채널 헤더 값 · Live·Export 시{" "}
        <span className="font-mono">x-bxm-systemheader</span>에 반영됩니다.
      </p>
      {channelVars.map((row) => (
        <HeaderVarRow
          key={row.key}
          row={row}
          onValueChange={(value) =>
            onChange(updateHeaderVarValue(config, row.key, value))
          }
        />
      ))}
    </div>
  );
}
