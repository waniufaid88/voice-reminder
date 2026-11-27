"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import {
  Pin,
  MoreVertical,
  Calendar,
  Clock,
  Check,
  Pencil,
  Trash2,
  Plus,
  Volume2,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AudioPlayer } from "./AudioPlayer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CompleteReminderDialog } from "./CompleteReminderDialog";
import { cleanChecklistItem } from "@/lib/checklist-cleaner";
import {
  formatReadableDueDate,
  formatAudioDuration,
  formatRecurrenceLabel,
} from "@/lib/date-utils";
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

export interface ItemRecord {
  _id: Id<"items">;
  userId?: Id<"users">;
  type: "note" | "reminder" | "list";
  title: string;
  content: string;
  isPinned: boolean;
  tags: string[];
  audioStorageId?: Id<"_storage">;
  audioDuration?: number;
  dueDate?: number;
  reminderStatus?: "pending" | "completed";
  isDaily?: boolean;
  recurrenceMode?: "once" | "daily" | "custom";
  recurrenceDays?: number[];
  checklist?: Array<{ id: string; text: string; completed: boolean }>;
  teamId?: Id<"teams">;
  creatorName?: string;
  completedByUserIds?: Id<"users">[];
  completedMembersCount?: number;
  totalMembersCount?: number;
  completionRecords?: Array<{
    userId: Id<"users">;
    userName?: string;
    completedAt: number;
    reason?: string;
  }>;
  createdAt: number;
}

interface ItemCardProps {
  item: ItemRecord;
  currentUserId?: Id<"users"> | string | null;
  onEdit: (item: ItemRecord) => void;
  isHighlighted?: boolean;
  onListCompleted?: (itemId: string) => void;
  isMenuOpen?: boolean;
  onToggleMenu?: (open: boolean) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (itemId: string) => void;
}

function formatCreatedDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  if (itemDate.getTime() === today.getTime()) {
    return `Today, ${timeStr}`;
  } else if (itemDate.getTime() === yesterday.getTime()) {
    return `Yesterday, ${timeStr}`;
  } else {
    const month = date.toLocaleDateString(undefined, { month: "short" });
    const day = date.getDate();
    return `${month} ${day}, ${timeStr}`;
  }
}

export function ItemCard({
  item,
  currentUserId,
  onEdit,
  isHighlighted,
  onListCompleted,
  isMenuOpen: isMenuOpenProp,
  onToggleMenu,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: ItemCardProps) {
  const togglePin = useMutation(api.items.togglePin);
  const deleteItem = useMutation(api.items.deleteItem);
  const toggleChecklistItem = useMutation(api.items.toggleChecklistItem);
  const toggleReminderStatus = useMutation(api.items.toggleReminderStatus);
  const snoozeReminder = useMutation(api.items.snoozeReminder);
  const updateItem = useMutation(api.items.update);

  // Team role lookup to verify admin or owner permissions
  const userTeamRole = useQuery(
    api.teams.getUserTeamRole,
    item.teamId && currentUserId
      ? { teamId: item.teamId, userId: currentUserId as Id<"users"> }
      : "skip"
  );

  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Reminder due calculations
  const isTeamItem = Boolean(item.teamId);
  const isCompletedReminder = isTeamItem && currentUserId
    ? Boolean(item.completedByUserIds?.includes(currentUserId as Id<"users">))
    : item.reminderStatus === "completed";
  const isOverdue =
    item.type === "reminder" &&
    !isCompletedReminder &&
    Boolean(item.dueDate && now > 0 && item.dueDate < now);

  // Permission enforcement:
  // Personal reminder: only creator can edit and delete
  // Team reminder:
  // - If completed or overdue: any team member can delete it (removes it exclusively for their view)
  // - If active/upcoming: creator, team admin, and team owner can edit, snooze, pin, and delete
  const isCreator = Boolean(
    currentUserId && item.userId && String(item.userId) === String(currentUserId)
  );
  const isTeamAdminOrOwner =
    userTeamRole === "owner" || userTeamRole === "admin";

  const isPerUserDelete =
    isTeamItem && !isCreator && !isTeamAdminOrOwner && (isCompletedReminder || isOverdue);

  const canEdit = !isTeamItem
    ? (!item.userId || !currentUserId || isCreator)
    : (isCreator || isTeamAdminOrOwner);

  const canSnooze = !isTeamItem
    ? canEdit
    : (isCreator || isTeamAdminOrOwner);

  const canPin = !isTeamItem
    ? true
    : (isCreator || isTeamAdminOrOwner);

  const canDelete = !isTeamItem
    ? (!item.userId || !currentUserId || isCreator)
    : (isCreator || isTeamAdminOrOwner || isPerUserDelete);

  const audioUrl = useQuery(
    api.items.getAudioUrl,
    item.audioStorageId ? { storageId: item.audioStorageId } : "skip"
  );

  // Menu state: support controlled mode (from parent dashboard) or fallback to local state
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const isControlled = typeof isMenuOpenProp === "boolean";
  const isMenuOpen = isControlled ? isMenuOpenProp : localMenuOpen;

  const setIsMenuOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const nextOpen = typeof open === "function" ? open(isMenuOpen) : open;
    if (onToggleMenu) {
      onToggleMenu(nextOpen);
    }
    if (!isControlled) {
      setLocalMenuOpen(nextOpen);
    }
  };

  const menuRef = useRef<HTMLDivElement>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingReminder, setIsTogglingReminder] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);

  // Close dropdown menu when clicking outside or pressing Escape (works for desktop and mobile)
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  // Quick checklist item addition
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemText, setNewItemText] = useState("");

  const completedCount =
    item.checklist?.filter((ci) => ci.completed).length || 0;
  const totalCount = item.checklist?.length || 0;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Split checklist items: pending at top, completed at bottom
  const pendingChecklist = useMemo<NonNullable<ItemRecord["checklist"]>>(
    () => item.checklist?.filter((ci) => !ci.completed) || [],
    [item.checklist]
  );
  const completedChecklist = useMemo<NonNullable<ItemRecord["checklist"]>>(
    () => item.checklist?.filter((ci) => ci.completed) || [],
    [item.checklist]
  );
  const sortedChecklist = useMemo<NonNullable<ItemRecord["checklist"]>>(
    () => [...pendingChecklist, ...completedChecklist],
    [pendingChecklist, completedChecklist]
  );

  const handleTogglePin = async () => {
    try {
      const willPin = !Boolean(item.isPinned);
      await togglePin({
        itemId: item._id,
        userId: currentUserId ? (currentUserId as Id<"users">) : undefined,
      });
      setIsMenuOpen(false);
      toast.success(willPin ? "Pinned to top 📌" : "Unpinned item");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update pin";
      toast.error(msg);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteItem({
        itemId: item._id,
        userId: currentUserId ? (currentUserId as Id<"users">) : undefined,
      });
      if (isPerUserDelete) {
        toast.success("Reminder removed from your view");
      } else {
        toast.success("Item deleted");
      }
      setIsDeleteDialogOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete item";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleReminder = async () => {
    if (isTogglingReminder) return;

    // Team reminder being completed: open the optional reason dialog
    if (isTeamItem && !isCompletedReminder) {
      setIsCompleteDialogOpen(true);
      return;
    }

    setIsTogglingReminder(true);
    const targetStatus = isCompletedReminder ? "pending" : "completed";
    try {
      const res = await toggleReminderStatus({
        itemId: item._id,
        targetStatus,
        userId: currentUserId ? (currentUserId as Id<"users">) : undefined,
      });
      if (res?.isRecurringAdvanced) {
        toast.success(
          `Completed for today! Next: ${formatReadableDueDate(res.nextDue)} 🔁`
        );
      } else {
        toast.success(
          targetStatus === "pending"
            ? "Restored reminder"
            : "Reminder completed! 🎉"
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update reminder";
      toast.error(msg);
    } finally {
      setIsTogglingReminder(false);
    }
  };

  const handleConfirmTeamComplete = async (reason?: string) => {
    if (isTogglingReminder) return;
    setIsTogglingReminder(true);
    try {
      await toggleReminderStatus({
        itemId: item._id,
        targetStatus: "completed",
        userId: currentUserId ? (currentUserId as Id<"users">) : undefined,
        reason,
      });
      setIsCompleteDialogOpen(false);
      toast.success("Reminder completed! 🎉");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update reminder";
      toast.error(msg);
    } finally {
      setIsTogglingReminder(false);
    }
  };

  const handleSnooze = async (minutes: number, label: string) => {
    try {
      await snoozeReminder({
        itemId: item._id,
        minutes,
        userId: currentUserId ? (currentUserId as Id<"users">) : undefined,
      });
      setIsSnoozeOpen(false);
      setIsMenuOpen(false);
      toast.success(`Snoozed for ${label} ⏰`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to snooze reminder";
      toast.error(msg);
    }
  };

  const handleToggleChecklist = async (ciId: string, currentCompleted: boolean) => {
    const isNowCompletingLastItem =
      !currentCompleted &&
      totalCount > 0 &&
      item.checklist?.filter((c) => (c.id === ciId ? true : c.completed)).length === totalCount;

    const wasFullyCompleted = totalCount > 0 && progressPercent === 100;

    try {
      if (isNowCompletingLastItem) {
        onListCompleted?.(item._id);
        toast(
          (t) => (
            <span className="flex items-center gap-2 text-xs">
              <span>🎉 List completed! Moved to Completed</span>
              <button
                type="button"
                onClick={async () => {
                  toast.dismiss(t.id);
                  try {
                    await toggleChecklistItem({
                      itemId: item._id,
                      checklistItemId: ciId,
                    });
                  } catch (err) {
                    console.error("Undo failed:", err);
                  }
                }}
                className="ml-2 font-bold underline text-indigo-600 dark:text-indigo-400 hover:opacity-80 cursor-pointer"
              >
                Undo
              </button>
            </span>
          ),
          { duration: 4000 }
        );
      } else if (wasFullyCompleted && currentCompleted) {
        toast.success("Item unchecked. List moved back to Active");
      }

      await toggleChecklistItem({
        itemId: item._id,
        checklistItemId: ciId,
      });
    } catch (err: unknown) {
      console.error("Failed to toggle checklist item:", err);
      toast.error("Failed to update checklist item");
    }
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) {
      setIsAddingItem(false);
      return;
    }

    const currentChecklist = item.checklist || [];
    const cleaned = cleanChecklistItem(newItemText.trim()) || newItemText.trim();
    const newEntry = {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 9),
      text: cleaned,
      completed: false,
    };

    const wasFullyCompleted = totalCount > 0 && progressPercent === 100;

    try {
      await updateItem({
        itemId: item._id,
        checklist: [...currentChecklist, newEntry],
      });
      setNewItemText("");
      setIsAddingItem(false);
      if (wasFullyCompleted) {
        toast.success("Item added. List moved back to Active");
      } else {
        toast.success("Item added to checklist");
      }
    } catch {
      toast.error("Failed to add checklist item");
    }
  };

  return (
    <div
      id={`item-${item._id}`}
      className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-300 p-4 sm:p-5 shadow-xs hover:shadow-md ${isSelected
        ? "ring-2 ring-indigo-500 bg-indigo-50/25 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-500 shadow-md "
        : ""
        }${isHighlighted
        ? "ring-4 ring-purple-500 shadow-xl shadow-purple-500/40 scale-[1.01] animate-pulse z-20"
        : ""
        } ${item.teamId ? "ring-1 ring-purple-500/25 dark:ring-purple-500/35 " : ""
        }${item.isPinned
          ? "border-purple-400/80 bg-purple-50/20 dark:border-purple-500/50 dark:bg-[#18192a]"
          : isCompletedReminder
            ? "border-emerald-600 dark:border-emerald-600 bg-white dark:bg-[#161726]"
            : isOverdue
              ? "border-rose-600 dark:border-rose-600 bg-white dark:bg-[#161726]"
              : item.type === "reminder"
                ? "border-amber-600 dark:border-amber-600 bg-white dark:bg-[#151624] hover:border-amber-600"
                : "border-zinc-200/90 dark:border-white/[0.07] bg-white dark:bg-[#151624] hover:border-zinc-300 dark:hover:border-white/[0.14]"
        }`}
    >
      <div>
        {/* Card Header: Type Badge, Pin, & 3-Dots Menu */}
        <div className="flex items-center justify-between gap-2">
          {/* Badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Selection Checkbox */}
            {isSelectionMode && (
              <div
                className="flex items-center justify-center mr-1"
                onClick={(e) => e.stopPropagation()}
              >
                {canDelete ? (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect?.(item._id)}
                    className="h-4.5 w-4.5 rounded-md border-2 border-zinc-400 dark:border-zinc-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 cursor-pointer transition-all"
                    aria-label={`Select ${item.title}`}
                  />
                ) : (
                  <div
                    className="flex items-center justify-center h-4.5 w-4.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700"
                    title="You cannot delete this item"
                  >
                    <span className="text-[10px]">🔒</span>
                  </div>
                )}
              </div>
            )}
            {item.type === "reminder" && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>🔔</span> Reminder
              </span>
            )}

            {item.type === "list" && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-300">
                <span>📋</span> List
              </span>
            )}

            {item.type === "note" && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-300">
                <span>📝</span> Note
              </span>
            )}

            {/* Team Reminder Badge */}
            {item.teamId && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/15 border border-purple-500/40 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300 shadow-2xs">
                <span>👥</span> Team
                {item.creatorName && (
                  <span className="font-normal opacity-85 text-[10px]">
                    • {item.creatorName}
                  </span>
                )}
              </span>
            )}

            {/* Team Member Completion Progress Badge */}
            {item.teamId && item.totalMembersCount !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-950/60 border border-purple-300/60 dark:border-purple-800/50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                👥 {item.completedMembersCount || 0}/{item.totalMembersCount} done
              </span>
            )}

            {/* Recurrence Indicator for Reminders */}
            {item.type === "reminder" && (item.recurrenceMode === "daily" || item.isDaily) && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                🔁 Daily
              </span>
            )}

            {item.type === "reminder" && item.recurrenceMode === "custom" && (
              <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                📅 {formatRecurrenceLabel(item.recurrenceMode, item.recurrenceDays)}
              </span>
            )}
          </div>

          {/* Pin & 3-Dots actions */}
          <div className="flex items-center gap-1">
            {/* Pin Toggle */}
            {canPin && (
              <button
                type="button"
                onClick={handleTogglePin}
                title={item.isPinned ? "Unpin item" : "Pin to top"}
                className={`rounded-lg p-1.5 transition-colors cursor-pointer ${item.isPinned
                  ? "text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                  }`}
              >
                <Pin className={`h-3.5 w-3.5 ${item.isPinned ? "fill-current" : ""}`} />
              </button>
            )}

            {/* 3-Dots Dropdown Trigger */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                title="More actions"
                aria-expanded={isMenuOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {/* 3-Dots Popup Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-zinc-200/90 bg-white p-1 shadow-lg dark:border-white/[0.08] dark:bg-[#1a1b2d] animate-in fade-in zoom-in-95">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onEdit(item);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Edit</span>
                    </button>
                  )}

                  {canEdit && canDelete && (
                    <div className="my-1 border-t border-zinc-100 dark:border-white/[0.06]" />
                  )}

                  {/* Delete trigger inside dropdown */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsDeleteDialogOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      <span>{isPerUserDelete ? "Remove" : "Delete"}</span>
                    </button>
                  )}

                  {!canEdit && !canDelete && (
                    <div className="px-2.5 py-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 italic flex items-center gap-1.5 select-none">
                      <span>🔒</span>
                      <span>View only</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card Title */}
        <h3
          className={`mt-3 text-base font-bold tracking-tight text-zinc-900 dark:text-white ${isCompletedReminder ? "line-through text-zinc-400 dark:text-zinc-500" : ""
            }`}
        >
          {item.title}
        </h3>

        {/* Team Reminder Creator Attribution */}
        {item.creatorName && (
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            Created by <span className="font-semibold text-zinc-700 dark:text-zinc-200">{item.creatorName}</span>
          </p>
        )}

        {/* ================= REMINDER CARD SPECIFICS ================= */}
        {item.type === "reminder" && item.dueDate && (
          <div className="mt-3 space-y-3">
            {/* Due date bar */}
            <div className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-[#1e1f32] border border-zinc-200/80 dark:border-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Calendar className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span className="truncate">
                {isCompletedReminder ? "Completed: " : isOverdue ? "⚠️ Overdue: " : "Due: "}
                {formatReadableDueDate(item.dueDate)}
              </span>
            </div>

            {/* Done & Snooze Buttons */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isTogglingReminder}
                onClick={handleToggleReminder}
                className={
                  isCompletedReminder
                    ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 text-xs rounded-xl h-8 px-3 cursor-pointer"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl h-8 px-3.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
                }
              >
                {isTogglingReminder ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                {isCompletedReminder
                  ? "Undo"
                  : item.recurrenceMode === "daily" || item.isDaily
                    ? "Done Today"
                    : "Done"}
              </Button>

              {!isCompletedReminder && canSnooze && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsSnoozeOpen(!isSnoozeOpen)}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:border-white/[0.08] dark:bg-[#232438] dark:text-zinc-200 dark:hover:bg-[#2d2e47] cursor-pointer transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <span>Snooze</span>
                  </button>

                  {/* Snooze Popup */}
                  {isSnoozeOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-32 rounded-xl border border-zinc-200/90 bg-white p-1 shadow-lg dark:border-white/[0.08] dark:bg-[#1a1b2d] animate-in fade-in">
                      <button
                        type="button"
                        onClick={() => handleSnooze(1, "1 min")}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        + 1 min
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(5, "5 mins")}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        + 5 mins
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(15, "15 mins")}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        + 15 mins
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(60, "1 hour")}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                      >
                        + 1 hour
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reminder content / description preview */}
            {item.content && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {item.content}
              </p>
            )}

            {/* Team Completion Notes / Reasons */}
            {isTeamItem && item.completionRecords && item.completionRecords.length > 0 && (
              <div className="space-y-1.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-2.5 border border-zinc-200/70 dark:border-white/[0.08]">
                <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Completion Notes</span>
                </p>
                <div className="space-y-1.5">
                  {item.completionRecords.map((record) => (
                    <div
                      key={record.userId}
                      className="text-xs text-zinc-600 dark:text-zinc-300 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {currentUserId && String(record.userId) === String(currentUserId)
                            ? "You"
                            : record.userName || "Teammate"}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          • {formatCreatedDate(record.completedAt)}
                        </span>
                      </div>
                      {record.reason ? (
                        <p className="text-zinc-600 dark:text-zinc-300 pl-2 border-l-2 border-emerald-500/50 text-[11px] italic bg-zinc-100/60 dark:bg-white/[0.04] py-0.5 rounded-r">
                          &ldquo;{record.reason}&rdquo;
                        </p>
                      ) : (
                        <p className="text-zinc-400 text-[10px] pl-2 italic">
                          (No reason provided)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= LIST CARD SPECIFICS ================= */}
        {item.type === "list" && (
          <div className="mt-2.5 space-y-2.5">
            {/* Completion Subtitle */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {totalCount > 0
                  ? `${completedCount} of ${totalCount} completed`
                  : "No checklist items yet"}
              </p>
              {totalCount > 0 && progressPercent === 100 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-300">
                  <span>✓</span> Completed
                </span>
              )}
            </div>

            {/* Progress Bar */}
            {totalCount > 0 && (
              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progressPercent === 100
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-xs shadow-emerald-500/50"
                    : "bg-gradient-to-r from-purple-500 to-indigo-500"
                    }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {/* Checklist Items: Pending at top, Completed at bottom */}
            {item.checklist && item.checklist.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {(isChecklistExpanded
                  ? sortedChecklist
                  : sortedChecklist.slice(0, 5)
                ).map((ci, idx) => {
                  const isFirstCompleted =
                    ci.completed &&
                    pendingChecklist.length > 0 &&
                    idx === pendingChecklist.length;

                  return (
                    <div key={ci.id}>
                      {isFirstCompleted && (
                        <div className="my-1.5 flex items-center gap-2">
                          <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/[0.08]" />
                          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                            Completed ({completedChecklist.length})
                          </span>
                          <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/[0.08]" />
                        </div>
                      )}
                      <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg p-1 hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                        <Checkbox
                          checked={ci.completed}
                          onCheckedChange={() => handleToggleChecklist(ci.id, ci.completed)}
                          className="mt-0.5"
                        />
                        <span
                          className={`text-xs break-words ${ci.completed
                            ? "line-through text-zinc-400 dark:text-zinc-500"
                            : "text-zinc-800 dark:text-zinc-200"
                            }`}
                        >
                          {ci.text}
                        </span>
                      </label>
                    </div>
                  );
                })}

                {/* Show More... / Show Less option if more than 5 items exist */}
                {item.checklist.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setIsChecklistExpanded(!isChecklistExpanded)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer pt-0.5"
                  >
                    {isChecklistExpanded ? (
                      <>
                        <span>Show Less</span>
                        <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        <span>Show More... (+{item.checklist.length - 5} items)</span>
                        <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Interactive "+ Add item" Button & Inline Form */}
            {isAddingItem ? (
              <form onSubmit={handleAddChecklistItem} className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="New item..."
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  className="flex-1 bg-zinc-100 dark:bg-[#1a1b2d] border border-zinc-200 dark:border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingItem(false);
                    setNewItemText("");
                  }}
                  className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingItem(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 pt-1 cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add item</span>
              </button>
            )}
          </div>
        )}

        {/* ================= NOTE CARD SPECIFICS ================= */}
        {item.type === "note" && (
          <div className="mt-2.5 space-y-3">
            {/* Note Content preview: truncate > 120 characters with ellipsis */}
            {item.content && (
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                {isContentExpanded || item.content.length <= 120
                  ? item.content
                  : `${item.content.slice(0, 120)}...`}
              </p>
            )}

            {item.content && item.content.length > 120 && (
              <button
                type="button"
                onClick={() => setIsContentExpanded(!isContentExpanded)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
              >
                <span>{isContentExpanded ? "Show Less" : "Show More..."}</span>
                {isContentExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}

            {/* Created Timestamp */}
            <p className="text-[11px] text-zinc-400 font-medium">
              Created: {formatCreatedDate(item.createdAt)}
            </p>
          </div>
        )}

        {/* Audio Player if audio attachment is present */}
        {audioUrl && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5" />
                <span>Voice Note</span>
              </span>
              {item.audioDuration && item.audioDuration > 0 && (
                <span className="rounded-md bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 text-[11px] font-mono font-bold text-purple-700 dark:text-purple-300">
                  {formatAudioDuration(item.audioDuration)}
                </span>
              )}
            </div>
            <AudioPlayer src={audioUrl} initialDuration={item.audioDuration} />
          </div>
        )}
      </div>

      {/* Footer Tags (if tags exist, hidden on mobile) */}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-4 hidden md:flex flex-wrap gap-1 border-t border-zinc-100 dark:border-white/[0.06] pt-2.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-zinc-100 dark:bg-[#1e1f32] px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      {/* Delete / Remove Confirmation Dialog */}
      {canDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isPerUserDelete ? "Remove this reminder?" : "Delete this item?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isPerUserDelete
                  ? `This will remove "${item.title}" from your view while remaining available for your teammates.`
                  : `This will permanently delete "${item.title}". This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {isDeleting
                  ? "Removing..."
                  : isPerUserDelete
                    ? "Remove for Me"
                    : "Yes, Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {/* Complete Reminder Dialog (for team reminders) */}
      {isTeamItem && (
        <CompleteReminderDialog
          isOpen={isCompleteDialogOpen}
          onClose={() => setIsCompleteDialogOpen(false)}
          onConfirm={handleConfirmTeamComplete}
          reminderTitle={item.title}
          isSubmitting={isTogglingReminder}
        />
      )}
    </div>
  );
}
