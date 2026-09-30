"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "warn" | "danger";
}

const Ctx = createContext<{ toast: (t: Omit<ToastItem, "id">) => void } | null>(
  null,
);

export function ToastRoot({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setItems((c) => [...c, { ...t, id }]);
    setTimeout(() => setItems((c) => c.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      <ToastProvider swipeDirection="right">
        {children}
        {items.map((t) => (
          <Toast key={t.id} variant={t.variant}>
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && (
              <ToastDescription>{t.description}</ToastDescription>
            )}
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used within <ToastRoot>");
  return v;
}
