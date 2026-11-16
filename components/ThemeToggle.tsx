"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: "icon" | "segmented";
}

export function ThemeToggle({
  className,
  showLabel = false,
  variant = "icon",
}: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === "segmented") {
    if (!mounted) {
      return (
        <div
          className={cn(
            "inline-flex items-center rounded-xl bg-zinc-100 dark:bg-zinc-800/90 p-1 border border-zinc-200/80 dark:border-white/[0.08] gap-1 opacity-60",
            className
          )}
        >
          <div className="flex h-7 w-7 items-center justify-center text-zinc-400">
            <Sun className="h-4 w-4" />
          </div>
          <div className="flex h-7 w-7 items-center justify-center text-zinc-400">
            <Moon className="h-4 w-4" />
          </div>
        </div>
      );
    }

    const isDark = resolvedTheme === "dark";

    return (
      <div
        className={cn(
          "inline-flex items-center rounded-xl bg-zinc-100 dark:bg-[#121320] p-1 border border-zinc-200/80 dark:border-white/[0.08] gap-1",
          className
        )}
      >
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer",
            !isDark
              ? "bg-white text-amber-500 shadow-2xs border border-zinc-200/80 font-semibold"
              : "text-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
          aria-label="Switch to light mode"
          title="Light mode"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer",
            isDark
              ? "bg-purple-600 text-white shadow-2xs font-semibold"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
          aria-label="Switch to dark mode"
          title="Dark mode"
        >
          <Moon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "h-9 w-9 rounded-xl border-zinc-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-900/80 text-zinc-400",
          className
        )}
        disabled
        aria-label="Toggle theme"
      >
        <span className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size={showLabel ? "default" : "icon"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative h-9 rounded-xl border-zinc-200/80 bg-white/80 text-zinc-700 shadow-2xs transition-all hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 cursor-pointer",
        showLabel ? "px-3 text-xs font-medium gap-2" : "w-9",
        className
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-zinc-200" />
      {showLabel && (
        <span className="ml-5">{isDark ? "Light mode" : "Dark mode"}</span>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export { ThemeToggle as ModeToggle };
