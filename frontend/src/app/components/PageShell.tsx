import type { ReactNode } from "react";
import { PageHeaderBar } from "./PageHeaderBar";

type PageShellProps = {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  containerClassName?: string;
  contentClassName?: string;
};

export function PageShell({
  icon,
  title,
  description,
  actions,
  children,
  containerClassName,
  contentClassName,
}: PageShellProps) {
  return (
    <div
      className={[
        "px-6 md:px-8 pt-0 pb-6 md:pb-8 bg-secondary min-h-full flex flex-col",
        containerClassName ?? "",
      ].join(" ")}
    >
      <div
        className={[
          "w-full mx-auto flex flex-col gap-5 flex-1 min-h-0",
          contentClassName ?? "",
        ].join(" ")}
      >
        <PageHeaderBar
          icon={icon}
          title={title}
          description={description}
          actions={actions}
        />
        {children}
      </div>
    </div>
  );
}

