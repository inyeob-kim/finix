import type { ExecutionAssertionView } from "@/lib/executionStepView";
import { cn } from "../ui/utils";

type Props = {
  assertions: ExecutionAssertionView[];
};

export function ExecutionAssertionList({ assertions }: Props) {
  if (assertions.length === 0) return null;

  return (
    <ul className="space-y-1 pl-1">
      {assertions.map((assertion, idx) => (
        <li
          key={`${assertion.name}-${idx}`}
          className="text-xs leading-relaxed"
        >
          <span
            className={cn(
              "inline-flex items-center font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded-sm mr-2 align-middle",
              assertion.passed
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
            )}
          >
            {assertion.passed ? "통과" : "실패"}
          </span>
          <span className="font-medium text-foreground">{assertion.name}</span>
          {!assertion.passed && assertion.message ? (
            <span className="block mt-0.5 ml-[calc(2.5rem+0.5rem)] text-muted-foreground font-mono text-[11px] break-all">
              {assertion.message}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
