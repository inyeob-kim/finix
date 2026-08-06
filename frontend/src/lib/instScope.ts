/**
 * Active institution scope — always sent on institution-scoped APIs.
 * Source of truth: auth session (authStore.user.inst_cd).
 */

import { useAuthStore } from "@/app/auth/authStore";

/**
 * Resolve the institution code the client must send as `inst_cd`.
 * Order: explicit arg → authenticated user's inst_cd.
 * Backend never defaults; missing query/body is rejected.
 */
export function getRequiredInstCd(override?: string | null): string {
  const fromArg = (override ?? "").trim();
  if (fromArg) return fromArg;

  const fromAuth = (useAuthStore.getState().user?.inst_cd ?? "").trim();
  if (fromAuth) return fromAuth;

  throw new Error("로그인이 필요하거나 기관코드(inst_cd)가 없습니다.");
}

export function setActiveInstCd(instCd: string): void {
  const v = instCd.trim();
  if (!v) {
    throw new Error("기관코드(inst_cd)가 비어 있습니다.");
  }
  const user = useAuthStore.getState().user;
  if (user) {
    useAuthStore.getState().login({ ...user, inst_cd: v });
  }
}

/** Append required `inst_cd` query param to an API path. */
export function withInstCdQuery(
  path: string,
  instCd?: string | null,
): string {
  const cd = getRequiredInstCd(instCd);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}inst_cd=${encodeURIComponent(cd)}`;
}
