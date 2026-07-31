import type { ReactNode } from "react";
import { SHELL_HEADER_ROW_CLASS, SHELL_HEADER_STICKY_CLASS } from "@/lib/finixShellLayout";
import { cn } from "./ui/utils";

type PageHeaderBarProps = {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

/** Sidebar logo row와 동일한 세로 높이; 본문 스크롤 시에도 상단 고정. */
export function PageHeaderBar({
  icon,
  title,
  description,
  actions,
}: PageHeaderBarProps) {
  return (
    <div className={cn("-mx-6 md:-mx-8 bg-background", SHELL_HEADER_STICKY_CLASS)}>
      <header
        className={`${SHELL_HEADER_ROW_CLASS} gap-3 px-6 md:px-8 text-foreground bg-background`}
      >
        <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden text-primary [&_svg]:shrink-0">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
        </div>
        {actions != null ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {description != null ? (
        <div className="px-6 md:px-8 py-3 text-sm text-muted-foreground leading-relaxed border-b border-border bg-background">
          {description}
        </div>
      ) : null}
    </div>
  );
}
