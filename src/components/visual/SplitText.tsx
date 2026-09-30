"use client";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import styles from "./SplitText.module.css";

type SplitTextProps = {
  text: string;
  className?: string;
  delay?: number;
  initialDelay?: number;
};

export function SplitText({
  text,
  className,
  delay = 80,
  initialDelay = 400,
}: SplitTextProps) {
  const reduced = usePrefersReducedMotion();
  const chars = Array.from(text);
  return (
    <span
      data-testid="split-text"
      data-reduced={reduced ? "true" : "false"}
      aria-label={text}
      className={[styles.root, className].filter(Boolean).join(" ")}
    >
      {chars.map((c, i) => (
        <span
          key={i}
          data-char
          aria-hidden="true"
          className={styles.char}
          style={{ animationDelay: `${initialDelay + i * delay}ms` }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
