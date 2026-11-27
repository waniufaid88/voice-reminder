"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { CheckSquare, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ItemCard, ItemRecord } from "./ItemCard";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface TabBasedReminderDashboardProps {
  userId?: Id<"users"> | null;
  teamId?: Id<"teams">;
  currentTime: number;
  searchQuery?: string;
  selectedTag?: string | null;
  onEdit: (item: ItemRecord) => void;
  title?: string;
  hideIfEmpty?: boolean;
  onClearSearch?: () => void;
  targetReminderId?: string | null;
  onTargetHandled?: () => void;
}

export function TabBasedReminderDashboard({
  userId,
  teamId,
  currentTime,
  searchQuery = "",
  selectedTag = null,
  onEdit,
  title,
  hideIfEmpty = false,
  onClearSearch,
  targetReminderId,
  onTargetHandled,
}: TabBasedReminderDashboardProps) {
  // 1. Dashboard Design: Default selection is Upcoming
  const [activeTab, setActiveTab] = useState<"upcoming" | "overdue" | "completed">("upcoming");

  // Single shared state to track the currently open reminder menu ID so only one is open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Multi-select batch deletion state
  const deleteMultipleItems = useMutation(api.items.deleteMultipleItems);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isConfirmBatchDeleteOpen, setIsConfirmBatchDeleteOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Query target item details if specified (e.g. from notification click)
  const targetItem = useQuery(
    api.items.getById,
    targetReminderId ? { itemId: targetReminderId as Id<"items"> } : "skip"
  );

  // 5. Tab Switching: Each tab maintains its own independent pagination state
  const [upcomingLimit, setUpcomingLimit] = useState(5);
  const [overdueLimit, setOverdueLimit] = useState(5);
  const [completedLimit, setCompletedLimit] = useState(5);

  // Automatically switch tab and expand limit when target item is resolved
  useEffect(() => {
    if (targetItem && targetItem.type === "reminder") {
      const nowTime = currentTime > 0 ? currentTime : Date.now();
      if (targetItem.reminderStatus === "completed") {
        setActiveTab("completed");
        setCompletedLimit((prev) => Math.max(prev, 25));
      } else if (targetItem.dueDate !== undefined && targetItem.dueDate > nowTime) {
        setActiveTab("upcoming");
        setUpcomingLimit((prev) => Math.max(prev, 25));
      } else {
        setActiveTab("overdue");
        setOverdueLimit((prev) => Math.max(prev, 25));
      }
    }
  }, [targetItem, currentTime]);

  // Reset pagination limits to 5 when search or tag filter changes
  useEffect(() => {
    setUpcomingLimit(5);
    setOverdueLimit(5);
    setCompletedLimit(5);
  }, [searchQuery, selectedTag]);

  // Reset open menu and selection mode when tab, search query, or tag changes
  useEffect(() => {
    setOpenMenuId(null);
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, [activeTab, searchQuery, selectedTag]);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (targetReminderId) {
      setHighlightedId(targetReminderId);

      const scrollTimer = setTimeout(() => {
        const el = document.getElementById(`item-${targetReminderId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      const clearTimer = setTimeout(() => {
        setHighlightedId(null);
        if (onTargetHandled) onTargetHandled();
      }, 3500);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [targetReminderId, activeTab, onTargetHandled]);

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
        teamId,
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
        teamId,
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
        allSelectableIds?: string[];
      }
    >
  >({});

  const cacheKey = `${teamId || "personal"}:${activeTab}:${searchQuery}:${selectedTag || ""}`;

  useEffect(() => {
    if (tabData !== undefined) {
      const t = setTimeout(() => {
        setCachedTabData((prev) => ({
          ...prev,
          [cacheKey]: tabData as unknown as {
            items: ItemRecord[];
            totalCount: number;
            hasMore: boolean;
            allSelectableIds?: string[];
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

  const handleShowLess = () => {
    if (activeTab === "upcoming") {
      setUpcomingLimit(5);
    } else if (activeTab === "overdue") {
      setOverdueLimit(5);
    } else if (activeTab === "completed") {
      setCompletedLimit(5);
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

  const allAvailableIds: string[] =
    tabData?.allSelectableIds ||
    cachedTabData[cacheKey]?.allSelectableIds ||
    items.map((i) => i._id);

  const isAllSelected =
    allAvailableIds.length > 0 &&
    allAvailableIds.every((id) => selectedIds.has(id));

  const handleToggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allAvailableIds));
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.size === 0 || isBatchDeleting) return;
    setIsBatchDeleting(true);
    try {
      const countToDelete = selectedIds.size;
      const res = await deleteMultipleItems({
        itemIds: Array.from(selectedIds) as Id<"items">[],
        userId: userId ? (userId as Id<"users">) : undefined,
      });
      const actualCount = res?.deletedCount ?? countToDelete;
      toast.success(
        `${actualCount} reminder${actualCount === 1 ? "" : "s"} deleted`
      );
      setIsConfirmBatchDeleteOpen(false);
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete selected reminders";
      toast.error(msg);
    } finally {
      setIsBatchDeleting(false);
    }
  };

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
      {/* Mobile-optimized: responsive padding, font sizing, and touch targets */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-zinc-100/90 dark:bg-[#151624] p-1 sm:p-1.5">
        {/* Tab 1: Upcoming (Default) */}
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex min-h-[40px] sm:min-h-[38px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none ${activeTab === "upcoming"
            ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]"
            }`}
        >
          <span className="text-xs sm:text-sm">🔔</span>
          <span className="truncate">Upcoming</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold font-mono transition-colors ${activeTab === "upcoming"
              ? "bg-amber-700/80 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
          >
            {upcomingCount}
          </span>
        </button>

        {/* Tab 2: Overdue */}
        <button
          type="button"
          onClick={() => setActiveTab("overdue")}
          className={`flex min-h-[40px] sm:min-h-[38px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none ${activeTab === "overdue"
            ? "bg-rose-600 text-white shadow-sm shadow-rose-600/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]"
            }`}
        >
          <span className="text-xs sm:text-sm">⚠️</span>
          <span className="truncate">Overdue</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold font-mono transition-colors ${activeTab === "overdue"
              ? "bg-rose-700/80 text-white"
              : overdueCount > 0
                ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-extrabold"
                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
          >
            {overdueCount}
          </span>
        </button>

        {/* Tab 3: Completed */}
        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={`flex min-h-[40px] sm:min-h-[38px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition-all cursor-pointer select-none ${activeTab === "completed"
            ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-white/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]"
            }`}
        >
          <span className="text-xs sm:text-sm">✓</span>
          <span className="truncate">Completed</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold font-mono transition-colors ${activeTab === "completed"
              ? "bg-emerald-700/80 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
          >
            {completedCount}
          </span>
        </button>
      </div>

      {/* Sub-header: Sorting info and Select button */}
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <span className="text-[11px] font-medium text-zinc-500">
          {activeTab === "upcoming"
            ? "Nearest upcoming first"
            : activeTab === "overdue"
              ? "Oldest overdue first"
              : "Most recently completed"}
        </span>

        {items.length > 0 && (
          <Button
            type="button"
            variant={isSelectionMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedIds(new Set());
            }}
            className={`h-7 px-2.5 text-xs font-semibold rounded-lg cursor-pointer transition-all ${isSelectionMode
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            <span>{isSelectionMode ? "Cancel" : "Select"}</span>
          </Button>
        )}
      </div>

      {/* Multi-Select Action Bar */}
      {isSelectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/80 dark:from-indigo-950/40 dark:via-[#161726] dark:to-indigo-950/40 p-2.5 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 underline cursor-pointer"
            >
              {isAllSelected ? "Deselect All" : `Select All (${allAvailableIds.length})`}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || isBatchDeleting}
              onClick={() => setIsConfirmBatchDeleteOpen(true)}
              className="h-8 px-3 text-xs font-semibold rounded-lg shadow-xs cursor-pointer bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              <span>Delete ({selectedIds.size})</span>
            </Button>
          </div>
        </div>
      )}

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

            {searchQuery && onClearSearch && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearSearch}
                className="mt-3 text-xs rounded-xl cursor-pointer"
              >
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          /* Cards Grid */
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ItemCard
                  key={item._id}
                  item={item as ItemRecord}
                  currentUserId={userId}
                  onEdit={onEdit}
                  isHighlighted={highlightedId === item._id}
                  isMenuOpen={openMenuId === item._id}
                  onToggleMenu={(open) => setOpenMenuId(open ? item._id : null)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(item._id)}
                  onToggleSelect={handleToggleSelect}
                />
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
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {currentLimit > 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleShowLess}
                      className="flex-1 sm:flex-none h-9 text-xs font-semibold px-3 cursor-pointer"
                    >
                      Show Less ↑
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadMore}
                    className="flex-1 sm:flex-none h-9 text-xs font-semibold px-4 cursor-pointer"
                  >
                    Show More (+{Math.min(5, totalCount - items.length)}) ↓
                  </Button>
                </div>
              </div>
            ) : totalCount > 5 ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-200/70 dark:border-zinc-800">
                <span className="text-xs text-zinc-400 font-medium">
                  Showing all {totalCount} {activeTab} reminders
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleShowLess}
                  className="w-full sm:w-auto h-9 text-xs font-semibold px-3 cursor-pointer"
                >
                  Show Less ↑
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={isConfirmBatchDeleteOpen} onOpenChange={setIsConfirmBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} selected reminder{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the {selectedIds.size} selected reminder{selectedIds.size === 1 ? "" : "s"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatchDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBatchDelete}
              disabled={isBatchDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              {isBatchDeleting ? "Deleting..." : `Yes, Delete ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
