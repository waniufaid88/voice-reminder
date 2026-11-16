"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { LogOut, ChevronDown, ChevronUp } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getCurrentUserAction, logoutAction } from "./actions/auth";
import { SmartCaptureBar } from "@/components/SmartCaptureBar";
import { ItemCard, ItemRecord } from "@/components/ItemCard";
import { FilterBar } from "@/components/FilterBar";
import { EditItemDialog } from "@/components/EditItemDialog";
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { StructuredItemData } from "@/components/ItemPreviewDialog";
import { TabBasedReminderDashboard } from "@/components/TabBasedReminderDashboard";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ _id: string; name: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "note" | "reminder" | "list">("reminder");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);

  // Mobile More Dialog
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Lists section expansion state (initially 3 lists, Show More / Show Less)
  const [isListsExpanded, setIsListsExpanded] = useState(false);

  useEffect(() => {
    setIsListsExpanded(false);
  }, [activeTab, searchQuery, selectedTag]);

  // Real-time ticker to transition upcoming reminders to overdue dynamically as time passes
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentTime(Date.now());
    }, 0);
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
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
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Available tags extracted dynamically
  const availableTags = useMemo(() => {
    if (!rawItems) return [];
    const set = new Set<string>();
    rawItems.forEach((i) => i.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [rawItems]);

  // Filtered non-reminder items (notes & lists)
  const filteredNonReminders = useMemo(() => {
    if (!rawItems) return [];
    return rawItems.filter((item) => {
      if (item.type === "reminder") return false;
      if (activeTab !== "all" && item.type !== activeTab) return false;
      if (selectedTag && !item.tags.includes(selectedTag)) return false;

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

  // Counts for main filter tabs
  const counts = useMemo(() => {
    if (!rawItems) return { all: 0, note: 0, reminder: 0, list: 0 };
    return {
      all: rawItems.length,
      note: rawItems.filter((i) => i.type === "note").length,
      reminder: rawItems.filter((i) => i.type === "reminder").length,
      list: rawItems.filter((i) => i.type === "list").length,
    };
  }, [rawItems]);

  // Pinned non-reminders (notes & lists)
  const pinnedNonReminders = useMemo(
    () => filteredNonNonReminders(filteredNonReminders, true),
    [filteredNonReminders]
  );

  // Regular non-reminders (notes & lists)
  const regularNonReminders = useMemo(
    () => filteredNonNonReminders(filteredNonReminders, false),
    [filteredNonReminders]
  );

  // Non-reminder lists (regular)
  const regularLists = useMemo(
    () => regularNonReminders.filter((i) => i.type === "list"),
    [regularNonReminders]
  );

  // Non-reminder notes (regular)
  const regularNotes = useMemo(
    () => regularNonReminders.filter((i) => i.type === "note"),
    [regularNonReminders]
  );

  function filteredNonNonReminders(items: ItemRecord[], isPinned: boolean) {
    return items.filter((i) => i.isPinned === isPinned);
  }

  // Save new item handler (supports single item or multiple reminders batch)
  const handleSaveItem = async (data: StructuredItemData | StructuredItemData[]) => {
    if (!user) return;

    const itemsToSave: StructuredItemData[] = Array.isArray(data)
      ? data
      : data.items && data.items.length > 1
        ? data.items
        : [data];

    let audioStorageId: Id<"_storage"> | undefined;

    // Upload audio blob to Convex Storage once if present
    const firstAudioBlob =
      (Array.isArray(data) ? data[0]?.audioBlob : data.audioBlob) ||
      itemsToSave[0]?.audioBlob;

    if (firstAudioBlob) {
      try {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": firstAudioBlob.type },
          body: firstAudioBlob,
        });
        const json = await result.json();
        audioStorageId = json.storageId as Id<"_storage">;
      } catch (err) {
        console.error("Audio file upload failed:", err);
      }
    }

    // Save each item individually into Convex
    for (const item of itemsToSave) {
      await createItem({
        userId: user._id as Id<"users">,
        type: item.type,
        title: item.title,
        content: item.content,
        dueDate: item.dueDate ?? undefined,
        isDaily: item.isDaily,
        recurrenceMode: item.recurrenceMode,
        recurrenceDays: item.recurrenceDays,
        checklist: item.checklist,
        tags: item.tags || [],
        audioStorageId,
        audioDuration: item.audioDuration,
      });
    }

    if (itemsToSave.length > 1) {
      toast.success(`Created ${itemsToSave.length} reminders! ⏰`);
    } else {
      const type = itemsToSave[0]?.type || "item";
      toast.success(
        `Saved as ${type.charAt(0).toUpperCase() + type.slice(1)}!`
      );
    }
  };

  const handleLogout = async () => {
    await logoutAction();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const userInitial = user?.name?.trim()?.[0]?.toUpperCase() || "R";

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading your dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/60 pb-28 md:pb-20 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      {/* Background Reminder Alert Engine */}
      {user?._id && <NotificationWatcher userId={user._id as Id<"users">} />}

      {/* Top Navbar (Original Web Header) */}
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
          <div className="flex items-center gap-2.5 sm:gap-3">
            <ThemeToggle className="hidden md:inline-flex" />
            {user && (
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {user.name}
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {user.email}
                </span>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="hidden md:inline-flex">
                  Sign out
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to sign out of this account?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be signed out of your session and redirected to the login page.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Yes, Sign out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Mobile: userInitial in place of Sign out & theme toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMoreOpen(true)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              aria-label="Account details"
              title={user?.name || "Account"}
            >
              {userInitial}
            </button>
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
        ) : activeTab === "reminder" ? (
          /* Dedicated Tab-Based Smart Reminder Dashboard */
          user?._id ? (
            <TabBasedReminderDashboard
              userId={user._id as Id<"users">}
              currentTime={currentTime}
              searchQuery={searchQuery}
              selectedTag={selectedTag}
              onEdit={setEditingItem}
            />
          ) : null
        ) : (
          /* Multi-type Dashboard Grid (All / Note / List) */
          <div className="space-y-6 sm:space-y-8">
            {/* Tab-Based Reminders Section (Only on "All" tab when reminders exist) */}
            {activeTab === "all" && user?._id && (
              <TabBasedReminderDashboard
                userId={user._id as Id<"users">}
                currentTime={currentTime}
                searchQuery={searchQuery}
                selectedTag={selectedTag}
                onEdit={setEditingItem}
                title="Reminders"
                hideIfEmpty={true}
              />
            )}

            {/* Pinned Non-Reminder Items (Notes & Lists) */}
            {pinnedNonReminders.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  📌 Pinned Items ({pinnedNonReminders.length})
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pinnedNonReminders.map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Lists Section: Initially display 3 lists. If > 3 lists exist, display Show More... with ellipsis, scrollable area, Show Less */}
            {regularLists.length > 0 && (activeTab === "all" || activeTab === "list") && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <span>📋 Lists ({regularLists.length})</span>
                </h2>

                {/* Display 3 lists initially, or all lists when expanded (no scroll container) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(isListsExpanded
                    ? regularLists
                    : regularLists.slice(0, 3)
                  ).map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>

                {/* If more than 3 lists exist */}
                {regularLists.length > 3 && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setIsListsExpanded(!isListsExpanded)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#161726] px-4 py-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-zinc-50 dark:hover:bg-[#1e1f32] shadow-2xs transition-all cursor-pointer"
                    >
                      {isListsExpanded ? (
                        <>
                          <span>Show Less</span>
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          <span>Show More... ({regularLists.length - 3} remaining)</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notes Section: Display all notes without limiting the number of notes */}
            {regularNotes.length > 0 && (activeTab === "all" || activeTab === "note") && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                  <span>📝 Notes ({regularNotes.length})</span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {regularNotes.map((item) => (
                    <ItemCard
                      key={item._id}
                      item={item as ItemRecord}
                      onEdit={setEditingItem}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State when no notes or lists match in active view */}
            {filteredNonReminders.length === 0 && (activeTab === "note" || activeTab === "list") && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 text-2xl">
                  {activeTab === "note" ? "📝" : "✓"}
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {searchQuery || selectedTag
                    ? `No ${activeTab}s match your filter`
                    : `No ${activeTab}s yet`}
                </h3>
                <p className="mt-1 text-xs text-zinc-500 max-w-sm">
                  {searchQuery || selectedTag
                    ? "Try adjusting your search terms or clearing selected tags."
                    : `Click the microphone button above to record your voice or type text to create a ${activeTab}.`}
                </p>
              </div>
            )}

            {/* Empty state for "all" if completely empty */}
            {activeTab === "all" && rawItems.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 text-2xl">
                  🎙️
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  No notes, reminders or lists yet
                </h3>
                <p className="mt-1 text-xs text-zinc-500 max-w-sm">
                  Click the microphone button above to record your voice, or type a task to let AI organize it automatically.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (md:hidden) */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onStartVoice={() => {
          window.dispatchEvent(new CustomEvent("start-voice-recording"));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onFocusSearch={() => {
          const input = document.getElementById("dashboard-search-input");
          input?.focus();
        }}
        onOpenMore={() => setIsMobileMoreOpen(true)}
      />

      {/* Edit Item Modal */}
      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
      />

      {/* Mobile More Options Dialog */}
      <Dialog open={isMobileMoreOpen} onOpenChange={setIsMobileMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
            <DialogDescription>
              Signed in as {user?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {/* User row */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-[#161726] border border-zinc-200 dark:border-white/[0.08]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white font-bold text-sm">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-zinc-900 dark:text-white truncate">
                  {user?.name || "User"}
                </p>
              </div>
            </div>

            {/* Theme Toggle with only dark and light icons */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-white/[0.08]">
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                Appearance
              </span>
              <ThemeToggle variant="segmented" />
            </div>

            {/* Sign Out */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-xs cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to sign out of your account?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
