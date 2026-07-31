import finixLogo from "@/assets/finix_logo_white.png";
import { SHELL_HEADER_ROW_CLASS } from "@/lib/finixShellLayout";
import {
  BookOpen,
  ChevronLeft,
  Clock,
  Database,
  FolderKanban,
  Home,
  Layers,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { cn } from "./ui/utils";

const navItemClass = (collapsed: boolean, isActive: boolean) =>
  cn(
    "group flex items-center py-2.5 rounded-sm transition-colors duration-200",
    collapsed ? "justify-center px-0 w-full" : "gap-3 px-3",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : cn(
          "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        ),
  );

export function Root() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  const navItems = [
    { icon: Home, label: "AI 시나리오 생성", path: "/" },
    { icon: FolderKanban, label: "시나리오 관리", path: "/scenario-registry" },
    { icon: Layers, label: "YAML 규칙", path: "/rules" },
    { icon: Database, label: "Data Pool", path: "/data-pool" },
    { icon: Clock, label: "테스트 이력", path: "/history" },
    { icon: BookOpen, label: "매뉴얼", path: "/manual" },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            SHELL_HEADER_ROW_CLASS,
            "bg-sidebar",
            collapsed ? "justify-center" : "gap-2 px-4",
          )}
        >
          <div className="size-8 shrink-0 overflow-hidden rounded-sm">
            <img
              src={finixLogo}
              alt="FINIX"
              className="size-full object-contain object-center scale-[1.55]"
              draggable={false}
            />
          </div>
          {!collapsed && (
            <h1 className="text-lg tracking-tight shrink-0">FINIX</h1>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 space-y-2", collapsed ? "p-2" : "p-4")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={navItemClass(collapsed, isActive)}
              >
                <Icon className="w-5 h-5 shrink-0 transition-colors group-hover:text-sidebar-accent-foreground" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div
          className={cn(
            "space-y-2 border-t border-sidebar-border",
            collapsed ? "p-2" : "p-4",
          )}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "w-full flex items-center py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            <ChevronLeft
              className={`w-5 h-5 shrink-0 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
            {!collapsed && <span>접기</span>}
          </button>

          <div
            className={cn(
              "w-full flex items-center py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            <div className="size-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm truncate">
                  {isAuthenticated ? user?.username : "게스트"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {isAuthenticated ? user?.role : "로그인 필요"}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className={cn(
              "w-full flex items-center py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
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
              <LogOut className="w-5 h-5 shrink-0" />
            ) : (
              <LogIn className="w-5 h-5 shrink-0" />
            )}
            {!collapsed && <span>{isAuthenticated ? "로그아웃" : "로그인"}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col min-h-0 overflow-hidden bg-background">
        <Outlet />
      </main>
    </div>
  );
}
