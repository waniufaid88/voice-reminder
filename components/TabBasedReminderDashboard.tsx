"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ItemCard, ItemRecord } from "./ItemCard";
import { Button } from "./ui/button";

interface TabBasedReminderDashboardProps {
  userId?: Id<"users"> | null;
  currentTime: number;
  searchQuery?: string;
  selectedTag?: string | null;
  onEdit: (item: ItemRecord) => void;
  title?: string;
  hideIfEmpty?: boolean;
}

export function TabBasedReminderDashboard({
  userId,
  currentTime,
  searchQuery = "",
  selectedTag = null,
  onEdit,
  title,
  hideIfEmpty = false,
}: TabBasedReminderDashboardProps) {
  // 1. Dashboard Design: Default selection is Upcoming
  const [activeTab, setActiveTab] = useState<"upcoming" | "overdue" | "completed">("upcoming");

  // 5. Tab Switching: Each tab maintains its own independent pagination state
  const [upcomingLimit, setUpcomingLimit] = useState(5);
  const [overdueLimit, setOverdueLimit] = useState(5);
  const [completedLimit, setCompletedLimit] = useState(5);

  const currentLimit =
    activeTab === "upcoming"
      ? upcomingLimit
      : activeTab === "overdue"
        ? overdueLimit
        : completedLimit;

  // 7. Performance: Fetch accurate counts separately from the loaded records
  const counts = useQuery(
    api.items.getReminderCounts,
    userId
      ? {
        userId,
        clientNow: currentTime > 0 ? currentTime : undefined,
        searchQuery: searchQuery || undefined,
        tag: selectedTag || undefined,
      }
      : "skip"
  );

  // Preserve previous counts during background query refreshes to prevent count flicker
  const [cachedCounts, setCachedCounts] = useState<{
    upcoming: number;
    overdue: number;
    completed: number;
    total: number;
  }>();

  useEffect(() => {
    if (counts !== undefined) {
      const t = setTimeout(() => {
        setCachedCounts(counts);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [counts]);

  const currentCounts = counts ?? cachedCounts;

  // 7. Performance: Fetch ONLY the records needed for the currently active tab
  const tabData = useQuery(
    api.items.getRemindersByTab,
    userId
      ? {
        userId,
        tab: activeTab,
        limit: currentLimit,
        clientNow: currentTime > 0 ? currentTime : undefined,
        searchQuery: searchQuery || undefined,
        tag: selectedTag || undefined,
      }
      : "skip"
  );

  // Preserve previous tabData per tab & search key so 10-second ticker refreshes do NOT blink or show skeletons
  const [cachedTabData, setCachedTabData] = useState<
    Record<
      string,
      {
        items: ItemRecord[];
        totalCount: number;
        hasMore: boolean;
      }
    >
  >({});

  const cacheKey = `${activeTab}:${searchQuery}:${selectedTag || ""}`;

  useEffect(() => {
    if (tabData !== undefined) {
      const t = setTimeout(() => {
        setCachedTabData((prev) => ({
          ...prev,
          [cacheKey]: tabData as unknown as {
            items: ItemRecord[];
            totalCount: number;
            hasMore: boolean;
          },
        }));
      }, 0);
      return () => clearTimeout(t);
    }
  }, [tabData, cacheKey]);

  // Use freshly fetched tabData or gracefully fallback to last known good data for this tab
  const currentTabData = tabData ?? cachedTabData[cacheKey];

  const handleLoadMore = () => {
    if (activeTab === "upcoming") {
      setUpcomingLimit((prev) => prev + 5);
    } else if (activeTab === "overdue") {
      setOverdueLimit((prev) => prev + 5);
    } else if (activeTab === "completed") {
      setCompletedLimit((prev) => prev + 5);
    }
  };

  const upcomingCount = currentCounts?.upcoming ?? 0;
  const overdueCount = currentCounts?.overdue ?? 0;
  const completedCount = currentCounts?.completed ?? 0;
  const totalReminders = currentCounts?.total ?? 0;

  // If used in composite dashboard and user has 0 reminders, hide section cleanly without layout jump
  if (hideIfEmpty && currentCounts !== undefined && totalReminders === 0) {
    return null;
  }

  const items = currentTabData?.items ?? [];
  const totalCount = currentTabData?.totalCount ?? 0;
  const hasMore = currentTabData?.hasMore ?? false;
  // Show loading skeleton ONLY during the initial data load of this tab
  const isLoading = currentTabData === undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Optional Section Header */}
      {title && (
        <div className="flex items-center justify-between border-b border-zinc-200/60 pb-2.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs text-sm">
              ⏰
            </span>
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
            <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 font-mono">
              {totalReminders}
            </span>
          </div>
          <span className="text-[11px] font-medium text-zinc-500">
            {activeTab === "upcoming"
              ? "Nearest upcoming first"
              : activeTab === "overdue"
                ? "Oldest overdue first"
                : "Most recently completed"}
          </span>
        </div>
      )}

      {/* 1. Dashboard Design: Three buttons/tabs [ Upcoming ] [ Overdue ] [ Completed ] */}
      {/* Mobile-optimized: grid-cols-3 with min 44px tap height for Android Chrome */}
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2 rounded-2xl bg-zinc-100/90 p-1.5 dark:bg-zinc-800/80">
        {/* Tab 1: Upcoming (Default) */}
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all cursor-pointer select-none sm:px-4 sm:min-h-[38px] ${activeTab === "upcoming"
            ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-900 dark:text-amber-400 ring-1 ring-amber-300/40 dark:ring-amber-500/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/50"
            }`}
        >
          <span className="text-sm">⏰</span>
          <span className="truncate">Upcoming</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono transition-colors ${activeTab === "upcoming"
              ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200"
              : "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
              }`}
          >
            {upcomingCount}
          </span>
        </button>

        {/* Tab 2: Overdue */}
        <button
          type="button"
          onClick={() => setActiveTab("overdue")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all cursor-pointer select-none sm:px-4 sm:min-h-[38px] ${activeTab === "overdue"
            ? "bg-white text-rose-700 shadow-sm dark:bg-zinc-900 dark:text-rose-400 ring-1 ring-rose-300/50 dark:ring-rose-500/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/50"
            }`}
        >
          <span className="text-sm">⚠️</span>
          <span className="truncate">Overdue</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono transition-colors ${activeTab === "overdue"
              ? "bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200"
              : overdueCount > 0
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-extrabold"
                : "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
              }`}
          >
            {overdueCount}
          </span>
        </button>

        {/* Tab 3: Completed */}
        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold transition-all cursor-pointer select-none sm:px-4 sm:min-h-[38px] ${activeTab === "completed"
            ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-900 dark:text-emerald-400 ring-1 ring-emerald-300/40 dark:ring-emerald-500/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/50"
            }`}
        >
          <span className="text-sm">✓</span>
          <span className="truncate">Completed</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold font-mono transition-colors ${activeTab === "completed"
              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200"
              : "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
              }`}
          >
            {completedCount}
          </span>
        </button>
      </div>

      {/* Active Tab Content Area: Only display the reminders of the active tab */}
      <div className="space-y-4">
        {isLoading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs animate-pulse dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          /* 8. Specific Empty States required by user */
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 py-12 px-4 text-center dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40">
            {activeTab === "upcoming" && (
              <>
                <span className="text-3xl mb-2">⏰</span>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  No upcoming reminders.
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  {searchQuery
                    ? "No upcoming reminders match your search."
                    : "Scheduled future reminders will appear here."}
                </p>
              </>
            )}

            {activeTab === "overdue" && (
              <>
                <span className="text-3xl mb-2">🎉</span>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  You&apos;re all caught up! No overdue reminders.
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  {searchQuery
                    ? "No overdue reminders match your search."
                    : "Great job! All past reminders have been attended to."}
                </p>
              </>
            )}

            {activeTab === "completed" && (
              <>
                <span className="text-3xl mb-2">📋</span>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  No completed reminders yet.
                </p>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                  {searchQuery
                    ? "No completed reminders match your search."
                    : "When you mark reminders as done, they will be archived here."}
                </p>
              </>
            )}
          </div>
        ) : (
          /* Cards Grid */
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard key={item._id} item={item as ItemRecord} onEdit={onEdit} />
              ))}
            </div>

            {/* Pagination Controls */}
            {hasMore ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-200/70 dark:border-zinc-800">
                <span className="text-xs text-zinc-500 font-medium">
                  Showing {items.length} of {totalCount}{" "}
                  {activeTab === "upcoming"
                    ? "upcoming"
                    : activeTab === "overdue"
                      ? "overdue"
                      : "completed"}{" "}
                  reminders
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleLoadMore}
                  className="w-full sm:w-auto h-9 text-xs font-semibold px-4 cursor-pointer"
                >
                  Load More (+{Math.min(5, totalCount - items.length)}) ↓
                </Button>
              </div>
            ) : totalCount > 5 ? (
              <div className="text-center pt-2">
                <span className="text-xs text-zinc-400 font-medium">
                  Showing all {totalCount} {activeTab} reminders
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
