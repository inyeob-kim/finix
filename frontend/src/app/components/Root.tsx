import finixLogo from "@/assets/finix-logo-mark-dark.png";
import { NAV_RAIL_WIDTH_CLASS, SHELL_HEADER_HEIGHT_CLASS } from "@/lib/finixShellLayout";
import {
  BookOpen,
  Clock,
  Database,
  FolderKanban,
  LayoutDashboard,
  Layers,
  LogIn,
  LogOut,
  Sparkles,
  User,
} from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "./ui/utils";

export function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  const navItems = [
    { icon: LayoutDashboard, label: "대시보드", path: "/" },
    { icon: Sparkles, label: "AI 시나리오 생성", path: "/generate" },
    { icon: FolderKanban, label: "시나리오 관리", path: "/scenario-registry" },
    { icon: Layers, label: "YAML 규칙", path: "/rules" },
    { icon: Database, label: "Data Pool", path: "/data-pool" },
    { icon: Clock, label: "테스트 이력", path: "/history" },
    { icon: BookOpen, label: "매뉴얼", path: "/manual" },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={cn(
          NAV_RAIL_WIDTH_CLASS,
          "flex shrink-0 flex-col overflow-hidden border-r border-nav-rail-border bg-nav-rail",
        )}
      >
        <div
          className={cn(
            SHELL_HEADER_HEIGHT_CLASS,
            "flex items-center justify-center border-b border-nav-rail-border",
          )}
        >
          <div className="size-8 shrink-0 overflow-hidden rounded-md">
            <img
              src={finixLogo}
              alt="FINIX"
              className="size-full object-contain object-center"
              draggable={false}
            />
          </div>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1.5 p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`);
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    aria-label={item.label}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-md transition-all",
                      isActive
                        ? "bg-gradient-to-br from-[var(--nav-rail-active-from)] to-[var(--nav-rail-active-to)] text-white shadow-[0_0_12px_rgba(20,184,166,0.45)]"
                        : "text-nav-rail-foreground hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="size-[1.15rem]" strokeWidth={isActive ? 2.25 : 2} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-1.5 border-t border-nav-rail-border p-2 pb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex size-10 items-center justify-center rounded-md text-nav-rail-foreground"
                title={isAuthenticated ? user?.username : "게스트"}
              >
                <div className="flex size-7 items-center justify-center rounded-full bg-white/10">
                  <User className="size-3.5 text-white/90" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {isAuthenticated
                ? `${user?.username} · ${user?.role} · ${user?.inst_cd}${
                    user?.inst_nm ? ` (${user.inst_nm})` : ""
                  }`
                : "게스트"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={isAuthenticated ? "로그아웃" : "로그인"}
                className="flex size-10 items-center justify-center rounded-md text-nav-rail-foreground transition-colors hover:bg-white/5 hover:text-white"
                onClick={() => {
                  if (isAuthenticated) {
                    logout();
                    navigate("/", { replace: true });
                    return;
                  }
                  navigate("/login");
                }}
              >
                {isAuthenticated ? (
                  <LogOut className="size-[1.15rem]" />
                ) : (
                  <LogIn className="size-[1.15rem]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {isAuthenticated ? "로그아웃" : "로그인"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <Outlet />
      </main>
    </div>
  );
}
