"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AudioPlayer } from "./AudioPlayer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  createdAt: number;
}

interface ItemCardProps {
  item: ItemRecord;
  onEdit: (item: ItemRecord) => void;
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

export function ItemCard({ item, onEdit }: ItemCardProps) {
  const togglePin = useMutation(api.items.togglePin);
  const deleteItem = useMutation(api.items.deleteItem);
  const toggleChecklistItem = useMutation(api.items.toggleChecklistItem);
  const toggleReminderStatus = useMutation(api.items.toggleReminderStatus);
  const snoozeReminder = useMutation(api.items.snoozeReminder);
  const updateItem = useMutation(api.items.update);

  const audioUrl = useQuery(
    api.items.getAudioUrl,
    item.audioStorageId ? { storageId: item.audioStorageId } : "skip"
  );

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);

  // Quick checklist item addition
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemText, setNewItemText] = useState("");

  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Reminder due calculations
  const isCompletedReminder = item.reminderStatus === "completed";
  const isOverdue =
    item.type === "reminder" &&
    !isCompletedReminder &&
    Boolean(item.dueDate && now > 0 && item.dueDate < now);

  const completedCount =
    item.checklist?.filter((ci) => ci.completed).length || 0;
  const totalCount = item.checklist?.length || 0;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleTogglePin = async () => {
    await togglePin({ itemId: item._id });
    setIsMenuOpen(false);
    toast.success(item.isPinned ? "Unpinned item" : "Pinned to top 📌");
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteItem({ itemId: item._id });
      toast.success("Item deleted");
    } catch {
      toast.error("Failed to delete item");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleReminder = async () => {
    const res = await toggleReminderStatus({ itemId: item._id });
    if (res?.isRecurringAdvanced) {
      toast.success(
        `Completed for today! Next: ${formatReadableDueDate(res.nextDue)} 🔁`
      );
    } else {
      toast.success(
        isCompletedReminder ? "Restored reminder" : "Reminder completed! 🎉"
      );
    }
  };

  const handleSnooze = async (minutes: number, label: string) => {
    await snoozeReminder({ itemId: item._id, minutes });
    setIsSnoozeOpen(false);
    setIsMenuOpen(false);
    toast.success(`Snoozed for ${label} ⏰`);
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) {
      setIsAddingItem(false);
      return;
    }

    const currentChecklist = item.checklist || [];
    const newEntry = {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 9),
      text: newItemText.trim(),
      completed: false,
    };

    try {
      await updateItem({
        itemId: item._id,
        checklist: [...currentChecklist, newEntry],
      });
      setNewItemText("");
      setIsAddingItem(false);
      toast.success("Item added to checklist");
    } catch {
      toast.error("Failed to add checklist item");
    }
  };

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border transition-all p-4 sm:p-5 shadow-xs hover:shadow-md ${
        item.isPinned
          ? "border-purple-400/80 bg-purple-50/20 dark:border-purple-500/50 dark:bg-[#18192a]"
          : isOverdue
            ? "border-rose-300 dark:border-rose-900/60 bg-white dark:bg-[#161726]"
            : "border-zinc-200/90 dark:border-white/[0.07] bg-white dark:bg-[#151624] hover:border-zinc-300 dark:hover:border-white/[0.14]"
      }`}
    >
      <div>
        {/* Card Header: Type Badge, Pin, & 3-Dots Menu */}
        <div className="flex items-center justify-between gap-2">
          {/* Badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
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
            <button
              type="button"
              onClick={handleTogglePin}
              title={item.isPinned ? "Unpin item" : "Pin to top"}
              className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                item.isPinned
                  ? "text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
              }`}
            >
              <Pin className="h-3.5 w-3.5 fill-current" />
            </button>

            {/* 3-Dots Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                title="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {/* 3-Dots Popup Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-xl border border-zinc-200/90 bg-white p-1 shadow-lg dark:border-white/[0.08] dark:bg-[#1a1b2d] animate-in fade-in zoom-in-95">
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

                  <button
                    type="button"
                    onClick={handleTogglePin}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                  >
                    <Pin className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{item.isPinned ? "Unpin" : "Pin"}</span>
                  </button>

                  {item.type === "reminder" && !isCompletedReminder && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setIsSnoozeOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span>Snooze</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-zinc-100 dark:border-white/[0.06]" />

                  {/* Delete trigger inside dropdown */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        <span>Delete</span>
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete &ldquo;{item.title}&rdquo;. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleConfirmDelete}
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          {isDeleting ? "Deleting..." : "Yes, Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card Title */}
        <h3
          className={`mt-3 text-base font-bold tracking-tight text-zinc-900 dark:text-white ${
            isCompletedReminder ? "line-through text-zinc-400 dark:text-zinc-500" : ""
          }`}
        >
          {item.title}
        </h3>

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
                onClick={handleToggleReminder}
                className={
                  isCompletedReminder
                    ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 text-xs rounded-xl h-8 px-3"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl h-8 px-3.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
                }
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {isCompletedReminder
                  ? "Undo"
                  : item.recurrenceMode === "daily" || item.isDaily
                    ? "Done Today"
                    : "Done"}
              </Button>

              {!isCompletedReminder && (
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
          </div>
        )}

        {/* ================= LIST CARD SPECIFICS ================= */}
        {item.type === "list" && (
          <div className="mt-2.5 space-y-2.5">
            {/* Completion Subtitle */}
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {totalCount > 0
                ? `${completedCount} of ${totalCount} completed`
                : "No checklist items yet"}
            </p>

            {/* Progress Bar */}
            {totalCount > 0 && (
              <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {/* Checklist Items */}
            {item.checklist && item.checklist.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {(isChecklistExpanded
                  ? item.checklist
                  : item.checklist.slice(0, 3)
                ).map((ci) => (
                  <label
                    key={ci.id}
                    className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg p-1 hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <Checkbox
                      checked={ci.completed}
                      onCheckedChange={() =>
                        toggleChecklistItem({
                          itemId: item._id,
                          checklistItemId: ci.id,
                        })
                      }
                      className="mt-0.5"
                    />
                    <span
                      className={`text-xs break-words ${
                        ci.completed
                          ? "line-through text-zinc-400 dark:text-zinc-500"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {ci.text}
                    </span>
                  </label>
                ))}

                {/* Show More... / Show Less option if more than 3 items exist */}
                {item.checklist.length > 3 && (
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
                        <span>Show More... (+{item.checklist.length - 3} items)</span>
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

            {/* Edit & Delete Action Buttons (matches Note Card in image) */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:border-white/[0.08] dark:bg-[#232438] dark:text-zinc-200 dark:hover:bg-[#2d2e47] cursor-pointer transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                <span>Edit</span>
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-rose-50 hover:text-rose-600 dark:border-white/[0.08] dark:bg-[#232438] dark:text-zinc-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    <span>Delete</span>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &ldquo;{item.title}&rdquo;.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleConfirmDelete}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      {isDeleting ? "Deleting..." : "Yes, Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
    </div>
  );
}
