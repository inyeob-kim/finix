import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

type Props = {
  children: ReactNode;
  hint: string | null;
  className?: string;
};

/** Disabled buttons do not receive pointer events; wrap with tooltip on a span. */
export function RulesMetaHintButton({
  children,
  hint,
  className,
}: Props) {
  if (!hint) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex cursor-not-allowed ${className ?? ""}`}
          tabIndex={0}
          aria-describedby={undefined}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="max-w-[min(20rem,calc(100vw-2rem))] text-left leading-relaxed"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
