"use client";

import { Home, Users, Mic, Bell, MoreHorizontal } from "lucide-react";

interface MobileBottomNavProps {
  activeTab: "all" | "note" | "reminder" | "list" | "teams";
  onTabChange: (tab: "all" | "note" | "reminder" | "list" | "teams") => void;
  onStartVoice: () => void;
  onFocusSearch: () => void;
  onOpenMore: () => void;
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
  onStartVoice,
  onFocusSearch,
  onOpenMore,
}: MobileBottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#10111d]/95 backdrop-blur-lg border-t border-zinc-200/80 dark:border-white/[0.08] px-3 py-1.5 flex items-center justify-around select-none">
      {/* Home */}
      <button
        type="button"
        onClick={() => onTabChange("all")}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 cursor-pointer transition-colors ${activeTab === "all"
          ? "text-purple-600 dark:text-purple-400 font-semibold"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
      >
        <Home className="h-5 w-5" />
        <span className="text-[10px] mt-0.5">Home</span>
      </button>

      {/* Reminders */}
      <button
        type="button"
        onClick={() => onTabChange("reminder")}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 cursor-pointer transition-colors ${activeTab === "reminder"
          ? "text-purple-600 dark:text-purple-400 font-semibold"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
      >
        <Bell className="h-5 w-5" />
        <span className="text-[10px] mt-0.5">Reminders</span>
      </button>

      {/* Center Floating Mic Button */}
      <button
        type="button"
        onClick={onStartVoice}
        aria-label="Start Voice Recording"
        className="relative -mt-6 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/40 border-4 border-white dark:border-[#0c0d16] active:scale-95 transition-transform cursor-pointer"
      >
        <Mic className="h-6 w-6" />
      </button>

      {/* Teams - Prominently Highlighted */}
      <button
        type="button"
        onClick={() => onTabChange("teams")}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 cursor-pointer transition-colors relative ${activeTab === "teams"
          ? "text-purple-600 dark:text-purple-400 font-bold"
          : "text-zinc-500 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-300"
          }`}
      >
        <div className="relative">
          <Users className={`h-5 w-5 ${activeTab === "teams" ? "stroke-[2.5]" : ""}`} />
          {activeTab === "teams" && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-purple-600 animate-pulse" />
          )}
        </div>
        <span className="text-[10px] mt-0.5">Teams</span>
      </button>

      {/* More / Settings */}
      <button
        type="button"
        onClick={onOpenMore}
        className="flex flex-col items-center justify-center min-w-[56px] py-1 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer transition-colors"
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className="text-[10px] mt-0.5">More</span>
      </button>
    </nav>
  );
}
