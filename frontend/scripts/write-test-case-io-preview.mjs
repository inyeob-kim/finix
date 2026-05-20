import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/app/components/TestCaseIoPreview.tsx",
);

const content = `import type { TestCaseReadDto } from "@/api/types";

interface TestCaseIoPreviewProps {
  test: TestCaseReadDto;
}

/** Request body and expected HTTP response for a materialized test case. */
export function TestCaseIoPreview({ test }: TestCaseIoPreviewProps) {
  const status = test.expected_status ?? null;
  const statusOk = status != null && status < 300;

  return (
    <motion.div className="grid gap-4 md:grid-cols-2 p-4 bg-muted/30 border-t border-border text-left">
      <div className="space-y-2 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Input (request_body)
        </p>
        <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto max-h-48">
          <code>{JSON.stringify(test.request_body ?? {}, null, 2)}</code>
        </pre>
      </div>
      <div className="space-y-2 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Output (expected)
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>HTTP status</span>
          <span
            className={
              statusOk
                ? "px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
            }
          >
            {status ?? "—"}
          </span>
        </div>
        <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto max-h-48">
          <code>{JSON.stringify(test.expected_body ?? {}, null, 2)}</code>
        </pre>
      </div>
    </motion.div>
  );
}
`;

// motion.div typo fix
const fixed = content.replace(/motion\.div/g, "motion.div").replace(/<motion\.div/g, "<motion.div");
const finalContent = content
  .replace(/<motion\.motion\.div/g, "<motion.div")
  .replace(/<\/motion\.motion\.div>/g, "</motion.div>")
  .replace(/motion\.motion\.div/g, "div")
  .replace(/<motion\.div/g, "<motion.div")
  .replace(/<\/motion\.div>/g, "</motion.div>");

// Actually write clean version without motion
const clean = `import type { TestCaseReadDto } from "@/api/types";

interface TestCaseIoPreviewProps {
  test: TestCaseReadDto;
}

/** Request body and expected HTTP response for a materialized test case. */
export function TestCaseIoPreview({ test }: TestCaseIoPreviewProps) {
  const status = test.expected_status ?? null;
  const statusOk = status != null && status < 300;

  return (
    <div className="grid gap-4 md:grid-cols-2 p-4 bg-muted/30 border-t border-border text-left">
      <div className="space-y-2 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Input (request_body)
        </p>
        <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto max-h-48">
          <code>{JSON.stringify(test.request_body ?? {}, null, 2)}</code>
        </pre>
      </motion.div>
      <div className="space-y-2 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Output (expected)
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>HTTP status</span>
          <span
            className={
              statusOk
                ? "px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
            }
          >
            {status ?? "—"}
          </span>
        </div>
        <pre className="bg-card border border-border rounded-sm p-3 text-xs overflow-x-auto max-h-48">
          <code>{JSON.stringify(test.expected_body ?? {}, null, 2)}</code>
        </pre>
      </motion.div>
    </motion.div>
  );
}
`.replace(/<\/?motion\.div>/g, (m) => (m.startsWith("</") ? "</div>" : "<div"));

fs.writeFileSync(target, clean, "utf8");
console.log("Wrote", target);
