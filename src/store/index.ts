import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "parent" | "child";

interface User {
  id: number;
  username: string;
  email: string;
  globalRole: "user" | "superadmin";
  avatarUrl?: string;
  level: number;
  xp: number;
  xpToNext: number;
  streak: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: "dq-auth" }
  )
);

interface FamilyState {
  activeFamilyId: number | null;
  activeFamilyRole: Role | null;
  setActiveFamily: (id: number, role: Role) => void;
  clear: () => void;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set) => ({
      activeFamilyId: null,
      activeFamilyRole: null,
      setActiveFamily: (id, role) =>
        set({ activeFamilyId: id, activeFamilyRole: role }),
      clear: () => set({ activeFamilyId: null, activeFamilyRole: null }),
    }),
    { name: "dq-active-family" }
  )
);
