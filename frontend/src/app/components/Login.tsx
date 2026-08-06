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
import { LoginScenarioFlow } from "./LoginScenarioFlow";
import {
  listInstitutions,
  loginWithInstitution,
  type InstitutionDto,
} from "@/api/institutionApi";
import { ApiError } from "@/api/client";

const PRESETS: Array<{ role: UserRole; label: string; description: string }> = [
  {
    role: "qa.editor",
    label: "QA Editor",
    description: "규칙 초안(Draft) 작성 및 시나리오 생성/수정",
  },
  {
    role: "qa.approver",
    label: "QA Approver",
    description: "규칙 검토 및 운영 활성화(향후 권한 확장)",
  },
];

export function Login() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);

  const [role, setRole] = useState<UserRole>("qa.editor");
  const [username, setUsername] = useState("qa.editor");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [institutions, setInstitutions] = useState<InstitutionDto[]>([]);
  const [instCd, setInstCd] = useState("");
  const [language, setLanguage] = useState("ko");
  const [loadingInst, setLoadingInst] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const helper = useMemo(() => {
    const preset = PRESETS.find((p) => p.role === role);
    return preset?.description ?? "";
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInst(true);
      setError(null);
      try {
        const res = await listInstitutions(true);
        if (cancelled) return;
        setInstitutions(res.items);
        if (res.items.length > 0) {
          setInstCd((prev) => prev || res.items[0].inst_cd);
        }
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "기관 목록을 불러오지 못했습니다.";
        setError(msg);
      } finally {
        if (!cancelled) setLoadingInst(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const doLogin = async () => {
    setError(null);
    if (!instCd.trim()) {
      setError("기관을 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await loginWithInstitution({
        username: username.trim() || role,
        role,
        inst_cd: instCd.trim(),
        password,
      });
      const u: AuthUser = {
        username: res.username,
        role: res.role as UserRole,
        inst_cd: res.inst_cd,
        inst_nm: res.inst_nm,
      };
      login(u);
      navigate(from, { replace: true });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "로그인에 실패했습니다.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(from, { replace: true });
  }, [from, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden bg-[#0F1419]">
      {/* Atmosphere — full-bleed, not a card */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(13,148,136,0.28),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(14,165,233,0.12),transparent_50%),linear-gradient(160deg,#0B1016_0%,#121820_45%,#0F1419_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="login-flow-glow absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="login-flow-glow-delayed absolute bottom-0 right-1/3 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12">
        {/* Brand + flow hero */}
        <div className="relative flex flex-col justify-center px-8 py-12 lg:col-span-8 lg:px-16 xl:px-24">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-none tracking-[0.14em] text-white">
              FINIX
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
              <span className="font-medium text-white">
                코드 없이 만드는 CBS QA 노코드 솔루션.
              </span>{" "}
              규칙을 시나리오로 묶고, 연결·실행까지 한 흐름으로 검증합니다.
            </p>

            <div className="mt-12 login-flow-enter">
              <LoginScenarioFlow />
            </div>
          </div>
        </div>

        {/* Login panel */}
        <div className="flex items-center justify-center border-t border-white/10 bg-white px-6 py-10 lg:col-span-4 lg:border-l lg:border-t-0 border-border/60">
          <div className="w-full max-w-xs">
            <div className="mb-8 text-center lg:hidden">
              <span className="text-sm font-semibold tracking-[0.18em] text-foreground">
                FINIX
              </span>
            </div>

            <div className="text-center">
              <div className="text-sm font-semibold tracking-[0.18em] text-muted-foreground">
                LOGIN
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
                <FinixField label="기관">
                  <FinixUnderlineSelect
                    value={instCd}
                    onChange={(e) => setInstCd(e.target.value)}
                    disabled={loadingInst || institutions.length === 0}
                  >
                    {institutions.length === 0 ? (
                      <option value="">
                        {loadingInst ? "불러오는 중…" : "기관 없음"}
                      </option>
                    ) : (
                      institutions.map((inst) => (
                        <option key={inst.inst_cd} value={inst.inst_cd}>
                          {inst.inst_cd} · {inst.inst_nm}
                        </option>
                      ))
                    )}
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

              {error ? (
                <div className="text-[12px] text-destructive leading-relaxed">
                  {error}
                </div>
              ) : null}

              <FinixPrimaryButton
                onClick={() => void doLogin()}
                className="mt-2 w-full"
                disabled={submitting || loadingInst || !instCd}
              >
                {submitting ? "로그인 중…" : "로그인"}
              </FinixPrimaryButton>

              <div className="text-[11px] text-muted-foreground leading-relaxed">
                기관은 세션에 바인딩되며 API 호출에 사용됩니다. 비밀번호는 데모용
                UI이며 서버에서 검증하지 않습니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
