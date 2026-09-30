"use client";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/components/ui/_utils/cn";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-tertiary/60 hover:text-primary hover:bg-muted/70 transition-all"
    >
      <Sun
        size={14}
        strokeWidth={1.5}
        className={cn(
          "transition-all duration-200",
          theme === "dark"
            ? "opacity-0 scale-50 absolute"
            : "opacity-100 scale-100",
        )}
      />
      <Moon
        size={14}
        strokeWidth={1.5}
        className={cn(
          "transition-all duration-200",
          theme === "light"
            ? "opacity-0 scale-50 absolute"
            : "opacity-100 scale-100",
        )}
      />
    </button>
  );
}
