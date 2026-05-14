import type { ReactNode } from "react";

type PageHeaderBarProps = {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

/**
 * 사이드바 로고 행(`flex items-center gap-3 p-6 border-b`)과 동일한 세로 높이·패딩을 맞춘 상단 헤더.
 * 설명은 줄 수를 늘리지 않도록 헤더 밖(같은 래퍼 아래)에 둔다.
 */
export function PageHeaderBar({
  icon,
  title,
  description,
  actions,
}: PageHeaderBarProps) {
  return (
    <div className="-mx-6 md:-mx-8 shrink-0">
      <header className="flex items-center gap-3 px-6 md:px-8 py-6 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden text-primary [&_svg]:shrink-0">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="text-lg tracking-tight truncate">{title}</h1>
        </div>
        {actions != null ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {description != null ? (
        <div className="px-6 md:px-8 pt-3 text-sm text-muted-foreground leading-relaxed">
          {description}
        </div>
      ) : null}
    </div>
  );
}
