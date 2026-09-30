import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent | { matches: boolean }) =>
      setReduced(e.matches);
    mql.addEventListener("change", onChange as EventListener);
    return () => mql.removeEventListener("change", onChange as EventListener);
  }, []);
  return reduced;
}
