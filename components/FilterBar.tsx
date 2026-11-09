"use client";

interface FilterBarProps {
  activeTab: "all" | "note" | "reminder" | "list";
  onTabChange: (tab: "all" | "note" | "reminder" | "list") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: {
    all: number;
    note: number;
    reminder: number;
    list: number;
  };
  availableTags: string[];
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
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
}: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Type Tabs */}
        <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80">
          <button
            type="button"
            onClick={() => onTabChange("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "all"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("note")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "note"
                ? "bg-white text-indigo-700 shadow-xs dark:bg-zinc-900 dark:text-indigo-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            📝 Notes ({counts.note})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("reminder")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "reminder"
                ? "bg-white text-amber-700 shadow-xs dark:bg-zinc-900 dark:text-amber-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            ⏰ Reminders ({counts.reminder})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("list")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "list"
                ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-900 dark:text-emerald-400"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            ✓ Lists ({counts.list})
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search titles, tags, notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-xs text-zinc-900 placeholder-zinc-400 focus:border-indigo-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <svg
            className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tag pills */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-zinc-400 mr-1">Tags:</span>
          {selectedTag && (
            <button
              type="button"
              onClick={() => onTagSelect(null)}
              className="rounded-lg bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200"
            >
              Clear tag filter ×
            </button>
          )}
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagSelect(selectedTag === tag ? null : tag)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-medium transition-all ${
                selectedTag === tag
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

