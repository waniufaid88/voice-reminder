"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getCurrentUserAction, logoutAction } from "./actions/auth";
import { SmartCaptureBar } from "@/components/SmartCaptureBar";
import { ItemCard, ItemRecord } from "@/components/ItemCard";
import { FilterBar } from "@/components/FilterBar";
import { EditItemDialog } from "@/components/EditItemDialog";
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { StructuredItemData } from "@/components/ItemPreviewDialog";
import { Button } from "@/components/ui/button";
import { isDateToday } from "@/lib/date-utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ _id: string; name: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "note" | "reminder" | "list">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentTime(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Convex mutations
  const createItem = useMutation(api.items.create);
  const generateUploadUrl = useMutation(api.items.generateUploadUrl);

  // Authenticate user on mount
  useEffect(() => {
    async function checkAuth() {
      const currentUser = await getCurrentUserAction();
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, [router]);

  // Real-time items subscription for authenticated user
  const rawItems = useQuery(
    api.items.listByUser,
    user ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Available tags extracted dynamically
  const availableTags = useMemo(() => {
    if (!rawItems) return [];
    const set = new Set<string>();
    rawItems.forEach((i) => i.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [rawItems]);

  // Filtered items based on tab, search query, and selected tag
  const filteredItems = useMemo(() => {
    if (!rawItems) return [];
    return rawItems.filter((item) => {
      // Tab filter
      if (activeTab !== "all" && item.type !== activeTab) return false;

      // Tag filter
      if (selectedTag && !item.tags.includes(selectedTag)) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesContent = item.content.toLowerCase().includes(q);
        const matchesTag = item.tags.some((t) => t.toLowerCase().includes(q));
        const matchesChecklist = item.checklist?.some((ci) =>
          ci.text.toLowerCase().includes(q)
        );
        if (!matchesTitle && !matchesContent && !matchesTag && !matchesChecklist) {
          return false;
        }
      }

      return true;
    });
  }, [rawItems, activeTab, selectedTag, searchQuery]);

  // Counts for tabs
  const counts = useMemo(() => {
    if (!rawItems) return { all: 0, note: 0, reminder: 0, list: 0 };
    return {
      all: rawItems.length,
      note: rawItems.filter((i) => i.type === "note").length,
      reminder: rawItems.filter((i) => i.type === "reminder").length,
      list: rawItems.filter((i) => i.type === "list").length,
    };
  }, [rawItems]);

  // Today's Reminders (due today or overdue pending, sorted chronologically ascending)
  const todayReminders = useMemo(() => {
    return filteredItems
      .filter(
        (i) =>
          i.type === "reminder" &&
          i.dueDate &&
          (isDateToday(i.dueDate) ||
            (i.reminderStatus !== "completed" && currentTime > 0 && i.dueDate < currentTime))
      )
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  }, [filteredItems, currentTime]);

  const todayReminderIds = useMemo(() => {
    return new Set(todayReminders.map((i) => i._id));
  }, [todayReminders]);

  // Pinned items (excluding today's reminders to avoid duplication)
  const pinnedItems = useMemo(
    () => filteredItems.filter((i) => i.isPinned && !todayReminderIds.has(i._id)),
    [filteredItems, todayReminderIds]
  );

  // Other items (excluding today's reminders and pinned items)
  const regularItems = useMemo(
    () => filteredItems.filter((i) => !i.isPinned && !todayReminderIds.has(i._id)),
    [filteredItems, todayReminderIds]
  );

  // Save new item handler (with audio upload if recorded)
  const handleSaveItem = async (data: StructuredItemData) => {
    if (!user) return;

    let audioStorageId: Id<"_storage"> | undefined;

    // Upload audio blob to Convex Storage if present
    if (data.audioBlob) {
      try {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": data.audioBlob.type },
          body: data.audioBlob,
        });
        const json = await result.json();
        audioStorageId = json.storageId as Id<"_storage">;
      } catch (err) {
        console.error("Audio file upload failed:", err);
      }
    }

    await createItem({
      userId: user._id as Id<"users">,
      type: data.type,
      title: data.title,
      content: data.content,
      dueDate: data.dueDate ?? undefined,
      isDaily: data.isDaily,
      recurrenceMode: data.recurrenceMode,
      recurrenceDays: data.recurrenceDays,
      checklist: data.checklist,
      tags: data.tags || [],
      audioStorageId,
      audioDuration: data.audioDuration,
    });
  };

  const handleLogout = async () => {
    await logoutAction();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading your dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/60 pb-20 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      {/* Background Reminder Alert Engine */}
      {user && <NotificationWatcher userId={user._id as Id<"users">} />}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight">
                Voice<span className="text-indigo-600 dark:text-indigo-400">Reminder</span>
              </span>
            </div>
          </div>

          {/* User profile & actions */}
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {user.name}
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {user.email}
                </span>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    Sign out
                  </Button>
                }
              />

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to sign out of this account?
                  </AlertDialogTitle>

                  <AlertDialogDescription>
                    You will be signed out of your session and redirected to the login
                    page.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>
                    Cancel
                  </AlertDialogCancel>

                  <AlertDialogAction
                    onClick={handleLogout}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Yes, Sign out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-3 sm:px-6 pt-5 sm:pt-8 space-y-6 sm:space-y-8">
        {/* Smart Capture Bar (Mic + Text) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight">Capture Thought</h1>
            <span className="text-xs text-zinc-400">
              Record voice or type text
            </span>
          </div>
          <SmartCaptureBar onSaveItem={handleSaveItem} />
        </section>

        {/* Filter & Search Bar */}
        <section>
          <FilterBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            counts={counts}
            availableTags={availableTags}
            selectedTag={selectedTag}
            onTagSelect={setSelectedTag}
          />
        </section>

        {/* Loading state for items */}
        {rawItems === undefined ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs animate-pulse dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 text-2xl">
              🎙️
            </div>
            <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              {searchQuery || selectedTag || activeTab !== "all"
                ? "No items match your filter"
                : "No notes, reminders or lists yet"}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm">
              {searchQuery || selectedTag || activeTab !== "all"
                ? "Try adjusting your search terms or clearing selected tags."
                : "Click the microphone button above to record your voice, or type a task to let AI organize it automatically."}
            </p>
          </div>
        ) : (
          /* Items Grid */
          <div className="space-y-6">
            {/* Today's Reminders (High Priority at Top) */}
            {todayReminders.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-amber-200/90 bg-amber-50/50 p-3 sm:p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2.5 dark:border-amber-900/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs text-sm">
                      🔔
                    </span>
                    <h2 className="text-sm font-bold tracking-tight text-amber-950 dark:text-amber-100">
                      Today&apos;s Reminders
                    </h2>
                    <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/80 dark:text-amber-200 font-mono">
                      {todayReminders.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">
                    Sorted by time
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  {todayReminders.map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Pinned Items */}
            {pinnedItems.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  📌 Pinned Items ({pinnedItems.length})
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pinnedItems.map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other Items */}
            {regularItems.length > 0 && (
              <div className="space-y-3">
                {(todayReminders.length > 0 || pinnedItems.length > 0) && (
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    All Other Items ({regularItems.length})
                  </h2>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {regularItems.map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit Item Modal */}
      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}
