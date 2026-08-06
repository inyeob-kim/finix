import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearFinixTaglineIntroSession } from "@/lib/finixBrandTagline";

export type UserRole = "qa.editor" | "qa.approver";

export type AuthUser = {
  username: string;
  role: UserRole;
  inst_cd: string;
  inst_nm: string;
};

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => {
        const inst_cd = (user.inst_cd ?? "").trim();
        if (!inst_cd) {
          throw new Error("기관코드(inst_cd)가 필요합니다.");
        }
        clearFinixTaglineIntroSession();
        set({
          user: {
            ...user,
            inst_cd,
            inst_nm: (user.inst_nm ?? "").trim() || inst_cd,
          },
          isAuthenticated: true,
        });
      },
      logout: () => {
        if (!get().isAuthenticated) return;
        clearFinixTaglineIntroSession();
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "finix.auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AuthState>;
        const user = p.user;
        // Drop legacy sessions without institution binding.
        if (!user?.inst_cd?.trim()) {
          return { ...current, user: null, isAuthenticated: false };
        }
        return {
          ...current,
          ...p,
          user,
          isAuthenticated: Boolean(p.isAuthenticated && user),
        };
      },
    },
  ),
);
