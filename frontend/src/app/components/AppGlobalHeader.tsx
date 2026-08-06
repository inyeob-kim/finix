import { User } from "lucide-react";
import { useAuthStore } from "../auth/authStore";
import { FinixBrandTagline } from "./FinixBrandTagline";
import {
  SHELL_GLOBAL_HEADER_HEIGHT_CLASS,
  SHELL_GLOBAL_HEADER_ROW_CLASS,
} from "@/lib/finixShellLayout";

/** App-wide context bar — brand tagline (left), institution & user (right). */
export function AppGlobalHeader() {
  const { user, isAuthenticated } = useAuthStore();

  const institutionLabel =
    isAuthenticated && user
      ? `${user.inst_nm}(${user.inst_cd})`
      : "기관 미선택";

  return (
    <div
      className={`${SHELL_GLOBAL_HEADER_ROW_CLASS} shrink-0 border-b border-nav-rail-border bg-nav-rail text-nav-rail-foreground`}
    >
      <div
        className={`${SHELL_GLOBAL_HEADER_HEIGHT_CLASS} flex w-full items-center justify-between gap-4 px-6 md:px-8`}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <FinixBrandTagline />
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs">
          <p className="min-w-0 max-w-[min(14rem,38vw)] truncate text-sm font-medium text-white">
            {institutionLabel}
          </p>
          {isAuthenticated && user ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-white/90">
              <User className="size-3.5 shrink-0 opacity-80" />
              <span className="text-white/70">{user.username}</span>
            </span>
          ) : (
            <span className="text-white/60">게스트</span>
          )}
        </div>
      </div>
    </div>
  );
}
