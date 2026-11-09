import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "amber" | "emerald";
}

const badgeVariants: Record<string, string> = {
  default:
    "border-transparent bg-indigo-600 text-white shadow-2xs hover:bg-indigo-500",
  secondary:
    "border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50",
  destructive:
    "border-transparent bg-rose-600 text-white shadow-2xs hover:bg-rose-500",
  outline: "text-zinc-950 dark:text-zinc-50 border-zinc-200 dark:border-zinc-800",
  amber:
    "border-transparent bg-amber-500 text-white shadow-2xs hover:bg-amber-400",
  emerald:
    "border-transparent bg-emerald-600 text-white shadow-2xs hover:bg-emerald-500",
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };

