import { FinixField, FinixUnderlineInput } from "../ui/finix-form";

type Props = {
  value: string;
  onChange: (value: string) => void;
  defaultName: string;
};

export function ScenarioPostmanExportFilenameField({
  value,
  onChange,
  defaultName,
}: Props) {
  return (
    <FinixField
      label="파일명"
      helperText={`비우면 ${defaultName}`}
    >
      <FinixUnderlineInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultName}
        className="font-mono text-sm"
      />
    </FinixField>
  );
}
