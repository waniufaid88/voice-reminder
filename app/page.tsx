"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import {
  LogOut,
  ChevronDown,
  ChevronUp,
  Users,
  ChevronRight,
  Palette,
  Pencil,
  Camera,
  Loader2,
} from "lucide-react";

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
import { TeamsSection } from "@/components/TeamsSection";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [user, setUser] = useState<{
    _id: string;
    name: string;
    email: string;
    image?: string;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Real-time reactive user profile from Convex
  const userProfile = useQuery(
    api.users.getProfile,
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );
  const activeUser = userProfile || user;

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | "note" | "reminder" | "list" | "teams">("reminder");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);

  // Targeted reminder for notification navigation & pulsing highlight
  const [targetReminderId, setTargetReminderId] = useState<string | null>(null);
  const [targetTeamId, setTargetTeamId] = useState<Id<"teams"> | null>(null);

  const navigateToReminder = useCallback((itemId: string, teamId?: string | null) => {
    setTargetReminderId(itemId);
    if (teamId) {
      setTargetTeamId(teamId as Id<"teams">);
      setActiveTab("teams");
    } else {
      setTargetTeamId(null);
      setActiveTab("reminder");
    }
  }, []);

  // Listen for notification navigation from Service Worker, in-app banner, or URL query parameters
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Initial URL parameters check (?reminderId=...&teamId=...)
    try {
      const params = new URLSearchParams(window.location.search);
      const reminderId = params.get("reminderId");
      const teamId = params.get("teamId");
      if (reminderId) {
        navigateToReminder(reminderId, teamId);
        // Clean URL to prevent re-triggering on manual refresh
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    } catch {}

    // 2. Service Worker push message listener
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE_TO_REMINDER") {
        const { itemId, teamId } = event.data;
        if (itemId) {
          navigateToReminder(itemId, teamId);
        }
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    // 3. Custom in-app event listener (e.g. from NotificationWatcher floating banner)
    const handleCustomNav = (event: Event) => {
      const customEvent = event as CustomEvent<{ itemId: string; teamId?: string | null }>;
      if (customEvent.detail?.itemId) {
        navigateToReminder(customEvent.detail.itemId, customEvent.detail.teamId);
      }
    };

    window.addEventListener("navigateToReminder", handleCustomNav);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
      window.removeEventListener("navigateToReminder", handleCustomNav);
    };
  }, [navigateToReminder]);

  // Account Dialog (Mobile & Desktop)
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Full Profile Image Viewer Dialog (Displays profile image only, no settings)
  const [isProfileImageViewerOpen, setIsProfileImageViewerOpen] = useState(false);

  // Edit Profile Dialog state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [activeUser?.image]);

  useEffect(() => {
    if (isEditProfileOpen) {
      setProfileNameInput(activeUser?.name || "");
      setProfileImagePreview(activeUser?.image || null);
      setProfileImageFile(null);
      setIsPhotoRemoved(false);
      setProfileError(null);
    }
  }, [isEditProfileOpen]);

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
  const updateProfileMutation = useMutation(api.users.updateProfile);

  // Authenticate user on mount
  useEffect(() => {
    async function checkAuth() {
      const currentUser = await getCurrentUserAction();
      if (!currentUser) {
        setIsMobileMoreOpen(false);
        setIsProfileImageViewerOpen(false);
        setIsEditProfileOpen(false);
        window.location.href = "/login";
      } else {
        setUser(currentUser);
        setIsMobileMoreOpen(false);
        setIsProfileImageViewerOpen(false);
        setIsEditProfileOpen(false);
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, [router]);

  // Ensure all dialogs and modals start closed when user changes or session initializes
  useEffect(() => {
    setIsMobileMoreOpen(false);
    setIsProfileImageViewerOpen(false);
    setIsEditProfileOpen(false);
  }, [user?._id]);

  // Real-time items subscription for authenticated user
  const rawItems = useQuery(
    api.items.listByUser,
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Teams subscription for authenticated user
  const myTeams = useQuery(
    api.teams.getMyTeams,
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );

  // Filtered reminder counts for accurate real-time tab badge counts
  const reminderCounts = useQuery(
    api.items.getReminderCounts,
    user?._id
      ? {
          userId: user._id as Id<"users">,
          clientNow: currentTime > 0 ? currentTime : undefined,
          searchQuery: searchQuery || undefined,
          tag: selectedTag || undefined,
        }
      : "skip"
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

  // Real-time filtered counts for main filter tabs
  const counts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tag = selectedTag;

    // Filtered teams count
    let teamsCount = 0;
    if (myTeams) {
      if (!q) {
        teamsCount = myTeams.length;
      } else {
        teamsCount = myTeams.filter((t) => {
          if (!t) return false;
          return (
            t.name.toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q)
          );
        }).length;
      }
    }

    if (!rawItems) {
      return { all: 0, note: 0, reminder: 0, list: 0, teams: teamsCount };
    }

    const itemMatches = (item: (typeof rawItems)[number]) => {
      if (tag && !item.tags.includes(tag)) return false;
      if (!q) return true;
      const matchesTitle = item.title.toLowerCase().includes(q);
      const matchesContent = item.content.toLowerCase().includes(q);
      const matchesTag = item.tags.some((t) => t.toLowerCase().includes(q));
      const matchesChecklist = item.checklist?.some((ci) =>
        ci.text.toLowerCase().includes(q)
      );
      return matchesTitle || matchesContent || matchesTag || matchesChecklist;
    };

    const notesCount = rawItems.filter((i) => i.type === "note" && itemMatches(i)).length;
    const listsCount = rawItems.filter((i) => i.type === "list" && itemMatches(i)).length;
    const remindersCount =
      reminderCounts !== undefined
        ? reminderCounts.total
        : rawItems.filter((i) => i.type === "reminder" && itemMatches(i)).length;

    const allCount = notesCount + listsCount + remindersCount;

    return {
      all: allCount,
      note: notesCount,
      reminder: remindersCount,
      list: listsCount,
      teams: teamsCount,
    };
  }, [rawItems, myTeams, searchQuery, selectedTag, reminderCounts]);

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
        teamId: item.teamId ?? undefined,
        creatorName: user.name || "Member",
      });
    }

    if (itemsToSave.length > 1) {
      toast.success(`Created ${itemsToSave.length} reminders! ⏰`);
    } else {
      const isTeam = Boolean(itemsToSave[0]?.teamId);
      const type = itemsToSave[0]?.type || "item";
      toast.success(
        isTeam
          ? `Saved as Team ${type.charAt(0).toUpperCase() + type.slice(1)}! 👥`
          : `Saved as ${type.charAt(0).toUpperCase() + type.slice(1)}!`
      );
    }
  };

  const handleLogout = async () => {
    setIsMobileMoreOpen(false);
    setIsProfileImageViewerOpen(false);
    setIsEditProfileOpen(false);
    await logoutAction();
    toast.success("Signed out successfully");
    window.location.href = "/login";
  };

  const handleProfileFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (PNG, JPG, WebP)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file must be smaller than 5MB");
      return;
    }

    setProfileImageFile(file);
    setIsPhotoRemoved(false);
    const objectUrl = URL.createObjectURL(file);
    setProfileImagePreview(objectUrl);
    setProfileError(null);
  };

  const handleRemovePhoto = () => {
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setIsPhotoRemoved(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser?._id) return;

    const trimmed = profileNameInput.trim();
    if (trimmed.length < 2) {
      setProfileError("Name must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 50) {
      setProfileError("Name cannot exceed 50 characters.");
      return;
    }

    setIsSavingProfile(true);
    setProfileError(null);

    try {
      let imageStorageId: Id<"_storage"> | undefined = undefined;
      let finalImageUrl: string | undefined = undefined;

      if (profileImageFile) {
        const postUrl = await generateUploadUrl();
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": profileImageFile.type },
          body: profileImageFile,
        });
        const json = await res.json();
        imageStorageId = json.storageId as Id<"_storage">;
      } else if (isPhotoRemoved) {
        finalImageUrl = "";
      }

      const updated = await updateProfileMutation({
        userId: activeUser._id as Id<"users">,
        name: trimmed,
        imageStorageId,
        image: isPhotoRemoved ? "" : finalImageUrl,
        removeImage: isPhotoRemoved,
      });

      setUser((prev) =>
        prev
          ? {
            ...prev,
            name: trimmed,
            image: isPhotoRemoved ? undefined : (updated?.image ?? undefined),
          }
          : prev
      );

      toast.success(
        isPhotoRemoved
          ? "Profile picture removed! ✨"
          : "Profile updated successfully! ✨"
      );
      setIsEditProfileOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      setProfileError(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const userInitial =
    activeUser?.name
      ?.trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    activeUser?.email?.charAt(0).toUpperCase() ||
    "U";

  // Dynamic search placeholder synchronized with active category tab and team context
  const [teamContextState, setTeamContextState] = useState<{
    teamName: string | null;
    subTab: string;
  }>({ teamName: null, subTab: "reminders" });

  const searchPlaceholder = useMemo(() => {
    if (activeTab === "reminder") return "Search personal reminders...";
    if (activeTab === "note") return "Search notes...";
    if (activeTab === "list") return "Search lists...";
    if (activeTab === "teams") {
      if (teamContextState.teamName) {
        if (teamContextState.subTab === "reminders") {
          return `Search ${teamContextState.teamName} reminders...`;
        }
        if (teamContextState.subTab === "members") {
          return "Search team members...";
        }
      }
      return "Search teams...";
    }
    return "Search all personal items...";
  }, [activeTab, teamContextState]);

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

          {/* User profile picture & actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeToggle className="hidden md:inline-flex" />

            {/* Desktop: Account details button (Teams, Profile, Settings) */}
            {activeUser && (
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(true)}
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100/70 hover:bg-zinc-200/80 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer shadow-2xs"
                title="Account Settings & Teams"
              >
                <Users className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>Account</span>
              </button>
            )}

            {/* Desktop: Sign out button */}
            {activeUser && (
              <button
                type="button"
                onClick={handleLogout}
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 transition-colors cursor-pointer shadow-2xs"
                title="Sign out of your account"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out</span>
              </button>
            )}

            {/* Header: Profile picture only. When clicked, display full profile image only */}
            {activeUser && (
              <button
                type="button"
                onClick={() => setIsProfileImageViewerOpen(true)}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-purple-500/80 hover:ring-purple-500 overflow-hidden bg-white dark:bg-[#12131f] shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                aria-label="View Profile Photo"
                title="View Profile Photo"
              >
                {activeUser.image && !avatarError ? (
                  <img
                    src={activeUser.image}
                    alt={activeUser.name || "User avatar"}
                    className="h-full w-full rounded-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-extrabold text-xs select-none">
                    {userInitial}
                  </div>
                )}
              </button>
            )}
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
          <SmartCaptureBar onSaveItem={handleSaveItem} userId={user?._id as Id<"users">} />
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
            searchPlaceholder={searchPlaceholder}
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
        ) : activeTab === "teams" ? (
          /* Dedicated Teams Section */
          user?._id ? (
            <TeamsSection
              user={user}
              currentTime={currentTime}
              onEditItem={setEditingItem}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onTeamStateChange={setTeamContextState}
              targetReminderId={targetReminderId}
              targetTeamId={targetTeamId}
              onTargetHandled={() => {
                setTargetReminderId(null);
                setTargetTeamId(null);
              }}
            />
          ) : null
        ) : activeTab === "reminder" ? (
          /* Dedicated Tab-Based Smart Reminder Dashboard */
          user?._id ? (
            <TabBasedReminderDashboard
              userId={user._id as Id<"users">}
              currentTime={currentTime}
              searchQuery={searchQuery}
              selectedTag={selectedTag}
              onEdit={setEditingItem}
              onClearSearch={() => setSearchQuery("")}
              targetReminderId={targetReminderId}
              onTargetHandled={() => setTargetReminderId(null)}
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
                onClearSearch={() => setSearchQuery("")}
                targetReminderId={targetReminderId}
                onTargetHandled={() => setTargetReminderId(null)}
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
                      currentUserId={user?._id}
                      onEdit={setEditingItem}
                      isHighlighted={targetReminderId === item._id}
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
                      currentUserId={user?._id}
                      onEdit={setEditingItem}
                      isHighlighted={targetReminderId === item._id}
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
                      currentUserId={user?._id}
                      onEdit={setEditingItem}
                      isHighlighted={targetReminderId === item._id}
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
                {(searchQuery || selectedTag) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedTag(null);
                    }}
                    className="mt-4 gap-1.5 text-xs rounded-xl cursor-pointer"
                  >
                    Clear Filter
                  </Button>
                )}
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
        userId={user?._id as Id<"users">}
        onClose={() => setEditingItem(null)}
      />

      {/* Account Dialog (Mobile & Desktop) */}
      <Dialog open={isMobileMoreOpen} onOpenChange={setIsMobileMoreOpen}>
        <DialogContent >
          <DialogHeader className="pb-4 text-left">
            <DialogTitle className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Account
            </DialogTitle>
            <DialogDescription className="sr-only">
              Manage your profile, teams, appearance, and session
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            {/* Profile Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-purple-100/70 to-indigo-100/80 dark:from-purple-950/50 dark:via-purple-900/30 dark:to-indigo-950/40 border border-purple-200/60 dark:border-purple-500/20 p-4 shadow-xs">
              {/* Decorative soft glow swoosh */}
              <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-purple-300/30 dark:bg-purple-500/10 blur-xl" />

              <div className="relative flex items-center gap-3.5">
                {/* Circular Avatar */}
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full ring-2 ring-purple-500 bg-white dark:bg-[#1a1b2e] shadow-sm overflow-hidden">
                  {activeUser?.image && !avatarError ? (
                    <img
                      src={activeUser.image}
                      alt={activeUser.name || "User avatar"}
                      className="h-full w-full rounded-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-xl font-black text-white select-none">
                      {userInitial}
                    </div>
                  )}
                </div>

                {/* Name, Email, and Edit Profile Button */}
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="truncate text-base font-extrabold text-zinc-900 dark:text-white leading-tight">
                    {activeUser?.name || "User"}
                  </h3>
                  <p className="truncate text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {activeUser?.email}
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditProfileOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/80 dark:border-purple-500/30 bg-purple-100/90 dark:bg-purple-500/20 px-3 py-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-200/80 dark:hover:bg-purple-500/30 active:scale-95 transition-all cursor-pointer shadow-2xs"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Edit Profile</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Dialog Options - ONLY THESE THREE: */}

            {/* 1. My Teams */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("teams");
                setIsMobileMoreOpen(false);
              }}
              className="w-full flex items-center justify-between rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#161726] px-4 py-3.5 hover:bg-purple-50/50 dark:hover:bg-[#1d1e30] hover:border-purple-200 dark:hover:border-purple-500/30 transition-all cursor-pointer shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  My Teams
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950/60 px-2 text-xs font-extrabold text-purple-700 dark:text-purple-300">
                  {counts.teams || 0}
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* 2. Appearance */}
            <div className="flex items-center justify-between rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#161726] px-4 py-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    Appearance
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Light or dark mode
                  </p>
                </div>
              </div>
              <ThemeToggle variant="segmented" />
            </div>

            {/* 3. Sign out */}
            <div className="pt-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-50 hover:bg-rose-100/90 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/40 py-3.5 text-sm font-bold text-rose-600 dark:text-rose-400 active:scale-[0.99] transition-all cursor-pointer shadow-2xs"
                  >
                    <LogOut className="h-4 w-4 stroke-[2.25]" />
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent>
          <DialogHeader className="pb-3 text-left">
            <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Edit Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Update your profile photo and display name.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 p-2.5 text-xs text-rose-600 dark:text-rose-400">
                {profileError}
              </div>
            )}

            {/* Profile Avatar Upload / Preview */}
            <div className="flex flex-col items-center justify-center gap-3 py-1">
              <div className="relative group">
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full ring-3 ring-purple-500/80 p-0.5 bg-white dark:bg-[#1a1b2e] shadow-md overflow-hidden">
                  {profileImagePreview ? (
                    <img
                      src={profileImagePreview}
                      alt="Avatar preview"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-2xl font-black text-white select-none">
                      {userInitial}
                    </div>
                  )}
                </div>

                {/* Camera overlay button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-white shadow-md hover:bg-purple-700 active:scale-95 transition-all cursor-pointer ring-2 ring-white dark:ring-[#12131f]"
                  title="Upload new picture"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleProfileFileSelected}
                className="hidden"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full bg-purple-100 hover:bg-purple-200/80 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 transition-colors cursor-pointer"
                >
                  {profileImagePreview ? "Change Photo" : "Upload Photo"}
                </button>
                {profileImagePreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Display Name
              </label>
              <Input
                type="text"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                placeholder="Your name"
                maxLength={50}
                required
                className="rounded-xl border-zinc-300 dark:border-white/10 dark:bg-[#1a1b2e] focus-visible:border-purple-600 focus-visible:ring-purple-600/20"
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Between 2 and 50 characters.
              </p>
            </div>

            {/* Email (Read-Only) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Email Address
              </label>
              <Input
                type="email"
                value={activeUser?.email || ""}
                disabled
                className="rounded-xl border-zinc-200 bg-zinc-100/70 text-zinc-500 dark:border-white/5 dark:bg-white/[0.03] dark:text-zinc-400 cursor-not-allowed"
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                Email is tied to your account login and cannot be edited.
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditProfileOpen(false)}
                disabled={isSavingProfile}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingProfile}
                className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Full Profile Image Viewer Dialog (Only displays full profile image, no settings or form) */}
      <Dialog open={isProfileImageViewerOpen} onOpenChange={setIsProfileImageViewerOpen}>
        <DialogContent>
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Profile Photo
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeUser?.name || "User"}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col items-center justify-center">
            <div className="relative flex h-75 w-75 sm:h-60 sm:w-60 shrink-0 items-center justify-center rounded-full ring-4 ring-purple-500/80 bg-white dark:bg-[#1a1b2e] shadow-xl overflow-hidden">
              {activeUser?.image && !avatarError ? (
                <img
                  src={activeUser.image}
                  alt={activeUser.name || "User profile"}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-6xl font-black text-white select-none">
                  {userInitial}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsProfileImageViewerOpen(false)}
                className="rounded-xl px-5 text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
