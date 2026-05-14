import finixLogo from "@/assets/finix_logo.jpg";
import {
  ChevronLeft,
  Clock,
  FolderKanban,
  Home,
  ListChecks,
  LogIn,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";

export function Root() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  const navItems = [
    { icon: Home, label: "AI 시나리오 생성", path: "/" },
    { icon: FolderKanban, label: "시나리오 관리", path: "/scenario-registry" },
    { icon: ListChecks, label: "테스트케이스 관리", path: "/test-cases" },
    { icon: Clock, label: "테스트 이력", path: "/history" },
    { icon: Settings, label: "규칙/메타 관리", path: "/rules" },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-6 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={finixLogo}
              alt="FINIX"
              className="w-7 h-7 object-contain"
              draggable={false}
            />
          </div>
          {!collapsed && (
            <h1 className="text-lg tracking-tight">FINIX</h1>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/test-cases"
                ? location.pathname === "/test-cases"
                : location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-200 ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:translate-x-[1px]"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0 transition-colors group-hover:text-sidebar-accent-foreground" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-sidebar-border space-y-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            <ChevronLeft
              className={`w-5 h-5 shrink-0 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
            {!collapsed && <span>접기</span>}
          </button>

          <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
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
      <main className="flex-1 overflow-auto bg-secondary">
        <Outlet />
      </main>
    </div>
  );
}
