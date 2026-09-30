"use client";
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { CssStarfield } from "./CssStarfield";

const Galaxy = dynamic(() => import("./Galaxy"), {
  ssr: false,
  loading: () => <CssStarfield />,
});

class GalaxyErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[GalaxyClient] WebGL failure, using CSS fallback:", err);
  }
  render() {
    return this.state.hasError ? <CssStarfield /> : this.props.children;
  }
}

export function GalaxyClient() {
  const reduced = usePrefersReducedMotion();
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-0"
      data-reduced-motion={reduced ? "true" : "false"}
    >
      <GalaxyErrorBoundary>
        <Galaxy
          mouseRepulsion={true}
          mouseInteraction={true}
          density={1.5}
          glowIntensity={0.5}
          saturation={0}
          transparent={false}
          disableAnimation={reduced}
        />
      </GalaxyErrorBoundary>
    </div>
  );
}
