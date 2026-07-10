import {
  STATUS_BADGE_ACTIVE_CLASS,
  STATUS_BADGE_DRAFT_CLASS,
} from "@/lib/finixUiClasses";
import { cn } from "./utils";

type ScenarioStatus = "active" | "draft";

const STATUS_LABEL: Record<ScenarioStatus, string> = {
  active: "운영",
  draft: "초안",
};

type Props = {
  status: ScenarioStatus;
  className?: string;
};

export function FinixScenarioStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        status === "active" ? STATUS_BADGE_ACTIVE_CLASS : STATUS_BADGE_DRAFT_CLASS,
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
