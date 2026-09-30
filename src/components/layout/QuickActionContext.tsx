"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface QuickAction {
  label: string;
  onClick: () => void;
}

const Ctx = createContext<{
  actions: QuickAction[];
  setActions: (a: QuickAction[]) => void;
} | null>(null);

export function QuickActionProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<QuickAction[]>([]);
  return (
    <Ctx.Provider value={{ actions, setActions }}>{children}</Ctx.Provider>
  );
}

export function useQuickActions() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuickActions requires QuickActionProvider");
  return v;
}

export function useRegisterQuickActions(actions: QuickAction[]) {
  const { setActions } = useQuickActions();
  useEffect(() => {
    setActions(actions);
    return () => setActions([]);
  }, [actions, setActions]);
}
