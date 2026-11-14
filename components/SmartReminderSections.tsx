"use client";

import { useState } from "react";
import { ItemCard, ItemRecord } from "./ItemCard";
import { Button } from "./ui/button";

interface SmartReminderSectionsProps {
  upcoming: ItemRecord[];
  overdue: ItemRecord[];
  completed: ItemRecord[];
  onEdit: (item: ItemRecord) => void;
  activeSubFilter?: "all" | "upcoming" | "overdue" | "completed";
  onSubFilterChange?: (filter: "all" | "upcoming" | "overdue" | "completed") => void;
  searchQuery?: string;
  isStandaloneView?: boolean;
  hideEmptySections?: boolean;
}

export function SmartReminderSections({
  upcoming,
  overdue,
  completed,
  onEdit,
  activeSubFilter = "all",
  onSubFilterChange,
  searchQuery = "",
  isStandaloneView = false,
  hideEmptySections = false,
}: SmartReminderSectionsProps) {
  // Pagination limits for each section (initial 5 items per specification)
  const [upcomingLimit, setUpcomingLimit] = useState(5);
  const [overdueLimit, setOverdueLimit] = useState(5);
  const [completedLimit, setCompletedLimit] = useState(5);

  // Completed section collapsible toggle
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(false);

  const totalReminders = upcoming.length + overdue.length + completed.length;

  const renderUpcomingSection = () => {
    if (hideEmptySections && upcoming.length === 0) return null;

    return (
      <section className="space-y-3.5 rounded-2xl border border-amber-200/90 bg-amber-50/40 p-4 sm:p-5 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/15">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3 dark:border-amber-900/40">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs text-base">
              ⏰
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Upcoming Reminders
                </h2>
                <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/80 dark:text-amber-200 font-mono">
                  {upcoming.length}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Showing nearest upcoming reminders in chronological order
              </p>
            </div>
          </div>

          {upcoming.length > 0 && (
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Sorted by nearest time ↑
            </span>
          )}
        </div>

        {/* Cards Grid */}
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-amber-200/80 py-8 text-center dark:border-amber-900/40 bg-white/40 dark:bg-zinc-900/40">
            <span className="text-2xl mb-1">🎉</span>
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              No upcoming reminders
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {searchQuery ? "No upcoming reminders match your search." : "You're all caught up for upcoming tasks!"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {upcoming.slice(0, upcomingLimit).map((item) => (
                <ItemCard key={item._id} item={item} onEdit={onEdit} />
              ))}
            </div>

            {/* Pagination / Load More Controls */}
            {upcoming.length > 5 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/40 dark:border-amber-900/30">
                <span className="text-xs text-zinc-500 font-medium">
                  Showing {Math.min(upcomingLimit, upcoming.length)} of {upcoming.length} upcoming
                </span>
                <div className="flex items-center gap-2">
                  {upcomingLimit < upcoming.length ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setUpcomingLimit((prev) => prev + 5)}
                        className="h-8 text-xs font-semibold"
                      >
                        Load More (+{Math.min(5, upcoming.length - upcomingLimit)}) ↓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUpcomingLimit(upcoming.length)}
                        className="h-8 text-xs"
                      >
                        View All ({upcoming.length})
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setUpcomingLimit(5)}
                      className="h-8 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                    >
                      Show Less ↑
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  const renderOverdueSection = () => {
    if (hideEmptySections && overdue.length === 0) return null;

    return (
      <section className="space-y-3.5 rounded-2xl border border-rose-300/80 bg-rose-50/40 p-4 sm:p-5 shadow-xs dark:border-rose-900/40 dark:bg-rose-950/15">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200/60 pb-3 dark:border-rose-900/40">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs text-base">
              ⚠️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Pending / Overdue
                </h2>
                <span className="rounded-full bg-rose-200/90 px-2 py-0.5 text-xs font-bold text-rose-900 dark:bg-rose-900/90 dark:text-rose-200 font-mono">
                  {overdue.length}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Scheduled time has passed • Action required
              </p>
            </div>
          </div>

          {overdue.length > 0 && (
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              Oldest overdue first ↑
            </span>
          )}
        </div>

        {/* Cards Grid */}
        {overdue.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200/80 py-8 text-center dark:border-rose-900/40 bg-white/40 dark:bg-zinc-900/40">
            <span className="text-2xl mb-1">✓</span>
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              No overdue reminders
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              All scheduled reminders are completely up to date!
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {overdue.slice(0, overdueLimit).map((item) => (
                <ItemCard key={item._id} item={item} onEdit={onEdit} />
              ))}
            </div>

            {/* Pagination / Load More Controls */}
            {overdue.length > 5 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-200/40 dark:border-rose-900/30">
                <span className="text-xs text-zinc-500 font-medium">
                  Showing {Math.min(overdueLimit, overdue.length)} of {overdue.length} pending
                </span>
                <div className="flex items-center gap-2">
                  {overdueLimit < overdue.length ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setOverdueLimit((prev) => prev + 5)}
                        className="h-8 text-xs font-semibold"
                      >
                        Load More (+{Math.min(5, overdue.length - overdueLimit)}) ↓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOverdueLimit(overdue.length)}
                        className="h-8 text-xs"
                      >
                        View All ({overdue.length})
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOverdueLimit(5)}
                      className="h-8 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                    >
                      Show Less ↑
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  const renderCompletedSection = () => {
    if (hideEmptySections && completed.length === 0) return null;

    return (
      <section className="space-y-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 sm:p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/30">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200/70 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs text-base">
              ✓
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Completed Reminders
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-mono">
                  {completed.length}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Past completed tasks • Saved permanently in database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {completed.length > 0 && (
              <button
                type="button"
                onClick={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                {isCompletedCollapsed ? "Show Section ↓" : "Collapse Section ↑"}
              </button>
            )}
          </div>
        </div>

        {/* Cards Grid */}
        {!isCompletedCollapsed && (
          <>
            {completed.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-8 text-center dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40">
                <span className="text-2xl mb-1">📋</span>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  No completed reminders yet
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  When you mark reminders as done, they will appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  {completed.slice(0, completedLimit).map((item) => (
                    <ItemCard key={item._id} item={item} onEdit={onEdit} />
                  ))}
                </div>

                {/* Pagination / Load More Controls */}
                {completed.length > 5 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 font-medium">
                      Showing {Math.min(completedLimit, completed.length)} of {completed.length} completed
                    </span>
                    <div className="flex items-center gap-2">
                      {completedLimit < completed.length ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setCompletedLimit((prev) => prev + 5)}
                            className="h-8 text-xs font-semibold"
                          >
                            Load More (+{Math.min(5, completed.length - completedLimit)}) ↓
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCompletedLimit(completed.length)}
                            className="h-8 text-xs"
                          >
                            View All ({completed.length})
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCompletedLimit(5)}
                          className="h-8 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                        >
                          Show Less ↑
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Sub-filter pills if in standalone Reminders view */}
      {isStandaloneView && onSubFilterChange && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80">
          <button
            type="button"
            onClick={() => onSubFilterChange("all")}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              activeSubFilter === "all"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            All Reminders ({totalReminders})
          </button>
          <button
            type="button"
            onClick={() => onSubFilterChange("upcoming")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              activeSubFilter === "upcoming"
                ? "bg-white text-amber-700 shadow-xs dark:bg-zinc-900 dark:text-amber-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <span>⏰ Upcoming</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
              {upcoming.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSubFilterChange("overdue")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              activeSubFilter === "overdue"
                ? "bg-white text-rose-700 shadow-xs dark:bg-zinc-900 dark:text-rose-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <span>⚠️ Pending / Overdue</span>
            <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 font-bold">
              {overdue.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSubFilterChange("completed")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
              activeSubFilter === "completed"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-900 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <span>✓ Completed</span>
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              {completed.length}
            </span>
          </button>
        </div>
      )}

      {/* Render sections according to activeSubFilter & priority */}
      {activeSubFilter === "upcoming" && renderUpcomingSection()}
      {activeSubFilter === "overdue" && renderOverdueSection()}
      {activeSubFilter === "completed" && renderCompletedSection()}
      {activeSubFilter === "all" && (
        <>
          {/* If there are overdue reminders, display them first for immediate urgency */}
          {overdue.length > 0 ? (
            <>
              {renderOverdueSection()}
              {renderUpcomingSection()}
              {renderCompletedSection()}
            </>
          ) : (
            <>
              {renderUpcomingSection()}
              {renderOverdueSection()}
              {renderCompletedSection()}
            </>
          )}
        </>
      )}
    </div>
  );
}
