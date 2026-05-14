import finixLoginPoster from "@/assets/finix_login.jpeg";
import finixLoginAnimation from "@/assets/finix_login_animation.mp4";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore, type AuthUser, type UserRole } from "../auth/authStore";
import {
  FinixField,
  FinixUnderlineInput,
  FinixUnderlineSelect,
} from "./ui/finix-form";
import { FinixPrimaryButton } from "./ui/finix-button";

const PRESETS: Array<{ role: UserRole; label: string; description: string }> = [
  {
    role: "qa.editor",
    label: "QA Editor",
    description: "규칙 초안(Draft) 작성 및 시나리오 생성/수정",
  },
  {
    role: "qa.approver",
    label: "QA Approver",
    description: "Draft 검토 및 Active 승인(향후 권한 확장)",
  },
];

export function Login() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);

  const [role, setRole] = useState<UserRole>("qa.editor");
  const [username, setUsername] = useState("qa.editor");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [branchId, setBranchId] = useState("1001");
  const [language, setLanguage] = useState("ko");
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const helper = useMemo(() => {
    const preset = PRESETS.find((p) => p.role === role);
    return preset?.description ?? "";
  }, [role]);

  const doLogin = () => {
    const u: AuthUser = {
      username: username.trim() || role,
      role,
    };
    login(u);
    navigate(from, { replace: true });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(from, { replace: true });
  }, [from, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover object-center lg:object-[40%_center] pointer-events-none"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={finixLoginPoster}
      >
        <source src={finixLoginAnimation} type="video/mp4" />
      </video>
      <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12">
        {/* Left illustration */}
        <div className="hidden lg:col-span-9 lg:flex items-center justify-center px-12">
          <div className="w-full">
            <div className="flex items-center gap-2 text-sm text-white/85">
              <span className="font-semibold tracking-[0.18em]">FINIX</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-3 bg-white flex items-center justify-center px-6 py-10 border-l border-border/60">
          <div className="w-full max-w-xs">
            <div className="text-center">
              <div className="text-sm font-semibold tracking-[0.18em] text-muted-foreground">
                LOGIN
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                  onClick={() => {
                    // mock: keep UI parity with reference (no-op)
                  }}
                >
                  계정개설요청
                </button>
              </div>
            </div>

            <div className="mt-10 space-y-7">
              <FinixField label="사용자 ID">
                <FinixUnderlineInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="예: qa.editor"
                  autoComplete="username"
                />
              </FinixField>

              <FinixField label="비밀번호">
                <div className="flex items-center gap-2 border-b border-border focus-within:border-primary/60">
                  <FinixUnderlineInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=" "
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    className="border-b-0"
                  />
                  <button
                    type="button"
                    className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "hide password" : "show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </FinixField>

              <FinixField label="역할" helperText={helper}>
                <FinixUnderlineSelect
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {PRESETS.map((p) => (
                    <option key={p.role} value={p.role}>
                      {p.label}
                    </option>
                  ))}
                </FinixUnderlineSelect>
              </FinixField>

              <div className="grid grid-cols-2 gap-6">
                <FinixField label="센터 ID">
                  <FinixUnderlineSelect
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="1001">1001</option>
                    <option value="1002">1002</option>
                    <option value="1003">1003</option>
                  </FinixUnderlineSelect>
                </FinixField>

                <FinixField label="언어">
                  <FinixUnderlineSelect
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </FinixUnderlineSelect>
                </FinixField>
              </div>

              <FinixPrimaryButton onClick={doLogin} className="mt-2 w-full">
                로그인
              </FinixPrimaryButton>

              <div className="text-[11px] text-muted-foreground leading-relaxed">
                현재는 데모용 Mock 로그인입니다. 비밀번호/센터/언어는 UI만 반영되고,
                실제 인증(SSO/JWT)은 추후 연동 가능합니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
