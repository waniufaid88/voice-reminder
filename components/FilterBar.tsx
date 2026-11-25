"use client";

import { useEffect, useRef } from "react";
import { Bell, List, FileText, Layers, Search, X, Users } from "lucide-react";

interface FilterBarProps {
  activeTab: "all" | "note" | "reminder" | "list" | "teams";
  onTabChange: (tab: "all" | "note" | "reminder" | "list" | "teams") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: {
    all: number;
    note: number;
    reminder: number;
    list: number;
    teams?: number;
    activeList?: number;
    completedList?: number;
  };
  availableTags: string[];
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  searchPlaceholder?: string;
}

export function FilterBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  counts,
  availableTags,
  selectedTag,
  onTagSelect,
  searchPlaceholder,
}: FilterBarProps) {
  // Default sample tags if none exist yet, ensuring user sees the design tags #list #voice #note #reminder #task
  const displayTags =
    availableTags.length > 0
      ? availableTags
      : ["list", "voice", "note", "reminder", "task"];

  const defaultPlaceholder =
    activeTab === "reminder"
      ? "Search personal reminders..."
      : activeTab === "note"
        ? "Search notes..."
        : activeTab === "list"
          ? "Search lists..."
          : activeTab === "teams"
            ? "Search teams..."
            : "Search all personal items...";

  const placeholder = searchPlaceholder || defaultPlaceholder;

  // Refs for auto-centering selected tab horizontally on mobile
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const container = tabsContainerRef.current;
    const activeBtn = tabRefs.current[activeTab];
    if (container && activeBtn) {
      const containerWidth = container.offsetWidth;
      const tabLeft = activeBtn.offsetLeft;
      const tabWidth = activeBtn.offsetWidth;
      const targetScrollLeft = tabLeft - containerWidth / 2 + tabWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: "smooth",
      });
    }
  }, [activeTab]);

  return (
    <div className="space-y-3.5 select-none">
      {/* Desktop & Mobile Main Tabs Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Category Tabs: Scrollable on mobile, flex on desktop */}
        <div
          ref={tabsContainerRef}
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1"
        >
          {/* Reminders Tab */}
          <button
            ref={(el) => {
              tabRefs.current.reminder = el;
            }}
            type="button"
            onClick={() => onTabChange("reminder")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "reminder"
                ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-100 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.07] dark:hover:bg-[#202135]"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Reminders ({counts.reminder})</span>
          </button>

          {/* Lists Tab */}
          <button
            ref={(el) => {
              tabRefs.current.list = el;
            }}
            type="button"
            onClick={() => onTabChange("list")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "list"
                ? "bg-purple-600 text-white shadow-sm shadow-purple-600/30"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-100 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.07] dark:hover:bg-[#202135]"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Lists ({counts.list})</span>
          </button>

          {/* Notes Tab */}
          <button
            ref={(el) => {
              tabRefs.current.note = el;
            }}
            type="button"
            onClick={() => onTabChange("note")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "note"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-100 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.07] dark:hover:bg-[#202135]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Notes ({counts.note})</span>
          </button>

          {/* All Tab */}
          <button
            ref={(el) => {
              tabRefs.current.all = el;
            }}
            type="button"
            onClick={() => onTabChange("all")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-purple-700 text-white shadow-sm shadow-purple-700/30 dark:bg-purple-600"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-100 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.07] dark:hover:bg-[#202135]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All ({counts.all})</span>
          </button>

          {/* Teams Tab - Prominently Highlighted */}
          <button
            ref={(el) => {
              tabRefs.current.teams = el;
            }}
            type="button"
            onClick={() => onTabChange("teams")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "teams"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-400/40"
                : "bg-white text-purple-700 hover:text-purple-900 border-2 border-purple-200/90 hover:bg-purple-50/60 dark:bg-[#161726] dark:text-purple-300 dark:border-purple-800/50 dark:hover:bg-purple-950/40"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>👥 Teams {counts.teams !== undefined ? `(${counts.teams})` : ""}</span>
          </button>
        </div>

        {/* Search input: Right side on desktop */}
        <div className="relative w-full md:w-64">
          <input
            id="dashboard-search-input"
            type="text"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-zinc-200/90 bg-white py-2 pl-9 pr-8 text-xs text-zinc-900 placeholder-zinc-400 focus:border-purple-600 focus:outline-none dark:border-white/[0.08] dark:bg-[#161726] dark:text-zinc-100 dark:placeholder-zinc-500 shadow-2xs"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tags row: hidden on mobile */}
      <div className="hidden md:flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Tags:
        </span>

        {selectedTag && (
          <button
            type="button"
            onClick={() => onTagSelect(null)}
            className="inline-flex items-center gap-1 rounded-lg bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300 cursor-pointer"
          >
            <span>#{selectedTag}</span>
            <X className="h-3 w-3" />
          </button>
        )}

        {displayTags.map((tag) => {
          const isSelected = selectedTag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagSelect(isSelected ? null : tag)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-100 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.06] dark:hover:bg-[#202135]"
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
