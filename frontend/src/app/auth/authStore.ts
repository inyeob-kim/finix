import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "qa.editor" | "qa.approver";

export type AuthUser = {
  username: string;
  role: UserRole;
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
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        if (!get().isAuthenticated) return;
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "finix.auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

