import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * 一般モード/管理画面モードの切り替えのみを担う、依存ライブラリなしの
 * 最小限のルーター(plan.md Assumptions: 同一アプリ内モード切り替え)。
 * URLパスによるルーティングは要件上不要なため導入しない。
 */
export type AppMode = "general" | "admin";

interface RouterContextValue {
  mode: AppMode;
  enterAdminMode: () => void;
  exitAdminMode: () => void;
}

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>("general");
  const value = useMemo<RouterContextValue>(
    () => ({
      mode,
      enterAdminMode: () => setMode("admin"),
      exitAdminMode: () => setMode("general"),
    }),
    [mode],
  );
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useAppMode(): RouterContextValue {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useAppMode must be used within a RouterProvider");
  }
  return context;
}
