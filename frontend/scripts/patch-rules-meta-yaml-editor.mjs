import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/components/RulesMeta.tsx",
);

let s = fs.readFileSync(target, "utf8");

if (s.includes("<YamlRulesEditPanel")) {
  console.log("Already patched");
  process.exit(0);
}

if (!s.includes("YamlRulesEditPanel")) {
  s = s.replace(
    'import { FinixLoading } from "./ui/finix-loading";',
    'import { FinixLoading } from "./ui/finix-loading";\nimport { YamlRulesEditPanel } from "./rules/YamlRulesEditPanel";',
  );
}

const anchor = "서비스 단위 YAML. 포맷 오류는 배포 전에 스키마 검증으로";
const anchorIdx = s.indexOf(anchor);
if (anchorIdx < 0) {
  console.error("anchor not found");
  process.exit(1);
}

const startIdx = s.lastIndexOf(") : (", anchorIdx);
const endIdx = s.indexOf("spellCheck={false}", anchorIdx);
if (startIdx < 0 || endIdx < 0) {
  console.error("range not found", startIdx, endIdx);
  process.exit(1);
}

const closeIdx = s.indexOf("                )}", endIdx);
if (closeIdx < 0) {
  console.error("close not found");
  process.exit(1);
}

const replacement = `) : (
                  <YamlRulesEditPanel
                    serviceCode={selected.serviceCode}
                    yamlText={yamlText}
                    onYamlChange={setYamlText}
                    disabled={editLoading}
                    yamlCopyDone={yamlCopyDone}
                    onCopy={() => void copyYamlToClipboard()}
                    onExport={exportYaml}
                    onSaveDraft={() => void saveDraft()}
                    editSaving={editSaving}
                    onNotice={setEditNotice}
                    onError={setEditError}
                  />
                )`;

s = s.slice(0, startIdx) + replacement + s.slice(closeIdx + "                )}".length);
fs.writeFileSync(target, s, "utf8");
console.log("Patched", target);
