"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { AudioPlayer } from "./AudioPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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
  checklist?: Array<{ id: string; text: string; completed: boolean }>;
  createdAt: number;
}

interface ItemCardProps {
  item: ItemRecord;
  onEdit: (item: ItemRecord) => void;
}

export function ItemCard({ item, onEdit }: ItemCardProps) {
  const togglePin = useMutation(api.items.togglePin);
  const deleteItem = useMutation(api.items.deleteItem);
  const toggleChecklistItem = useMutation(api.items.toggleChecklistItem);
  const toggleReminderStatus = useMutation(api.items.toggleReminderStatus);
  const snoozeReminder = useMutation(api.items.snoozeReminder);

  const audioUrl = useQuery(
    api.items.getAudioUrl,
    item.audioStorageId ? { storageId: item.audioStorageId } : "skip"
  );

  const [isSnoozeOpen, setIsSnoozeOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reminder due status calculations
  const now = Date.now();
  const isCompletedReminder = item.reminderStatus === "completed";
  const isOverdue =
    item.type === "reminder" &&
    !isCompletedReminder &&
    item.dueDate &&
    item.dueDate < now;
  const isDueToday =
    item.type === "reminder" &&
    !isCompletedReminder &&
    item.dueDate &&
    new Date(item.dueDate).toDateString() === new Date().toDateString();

  const formatDueDate = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const timeStr = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isToday) return `Today at ${timeStr}`;
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeStr}`;
  };

  const completedCount =
    item.checklist?.filter((ci) => ci.completed).length || 0;
  const totalCount = item.checklist?.length || 0;

  const handleTogglePin = async () => {
    await togglePin({ itemId: item._id });
    toast.success(item.isPinned ? "Unpinned item" : "Pinned to top 📌");
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this item?")) {
      setIsDeleting(true);
      await deleteItem({ itemId: item._id });
      toast.success("Item deleted");
    }
  };

  const handleToggleReminder = async () => {
    await toggleReminderStatus({ itemId: item._id });
    toast.success(
      isCompletedReminder ? "Restored reminder" : "Reminder completed! 🎉"
    );
  };

  const handleSnooze = async (minutes: number, label: string) => {
    await snoozeReminder({ itemId: item._id, minutes });
    setIsSnoozeOpen(false);
    toast.success(`Snoozed for ${label} ⏰`);
  };

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition-all hover:shadow-md dark:bg-zinc-900 ${
        item.isPinned
          ? "border-indigo-400/80 bg-indigo-50/15 dark:border-indigo-500/50 dark:bg-indigo-950/10"
          : isOverdue
          ? "border-rose-300 dark:border-rose-900/60"
          : "border-zinc-200/90 dark:border-zinc-800"
      }`}
    >
      <div>
        {/* Top Header: Badge & Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {item.type === "note" && (
              <Badge variant="default" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                📝 Note
              </Badge>
            )}
            {item.type === "reminder" && (
              <Badge
                variant={
                  isCompletedReminder
                    ? "secondary"
                    : isOverdue
                    ? "destructive"
                    : "amber"
                }
                className={isCompletedReminder ? "line-through text-zinc-400" : ""}
              >
                ⏰ Reminder
              </Badge>
            )}
            {item.type === "list" && (
              <Badge variant="emerald" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                ✓ List ({completedCount}/{totalCount})
              </Badge>
            )}

            {/* Pin Badge */}
            {item.isPinned && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                📌 Pinned
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
            {/* Toggle Pin */}
            <button
              type="button"
              onClick={handleTogglePin}
              className={`rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                item.isPinned
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-400 hover:text-zinc-600"
              }`}
              title={item.isPinned ? "Unpin" : "Pin to top"}
            >
              📌
            </button>

            {/* Edit */}
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              title="Edit item"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {/* Delete */}
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="rounded-lg p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              title="Delete item"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Title */}
        <h3
          className={`mt-2.5 text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 ${
            isCompletedReminder ? "line-through text-zinc-400 dark:text-zinc-500" : ""
          }`}
        >
          {item.title}
        </h3>

        {/* Reminder Due Bar */}
        {item.type === "reminder" && item.dueDate && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/50">
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`font-semibold ${
                  isCompletedReminder
                    ? "text-zinc-500"
                    : isOverdue
                    ? "text-rose-600 dark:text-rose-400"
                    : isDueToday
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {isCompletedReminder
                  ? "Completed"
                  : isOverdue
                  ? "⚠️ Overdue: "
                  : isDueToday
                  ? "🔔 Due Today: "
                  : "📅 Due: "}
                {formatDueDate(item.dueDate)}
              </span>
            </div>

            <div className="relative flex items-center gap-1.5">
              {/* Complete Toggle Button */}
              <Button
                type="button"
                size="sm"
                variant={isCompletedReminder ? "secondary" : "default"}
                onClick={handleToggleReminder}
                className={!isCompletedReminder ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""}
              >
                {isCompletedReminder ? "↺ Undo" : "✓ Done"}
              </Button>

              {/* Snooze Dropdown */}
              {!isCompletedReminder && (
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsSnoozeOpen(!isSnoozeOpen)}
                  >
                    ⏰ Snooze
                  </Button>

                  {isSnoozeOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in">
                      <button
                        type="button"
                        onClick={() => handleSnooze(15, "15 mins")}
                        className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        + 15 mins
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(60, "1 hour")}
                        className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        + 1 hour
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSnooze(24 * 60, "Tomorrow")}
                        className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        + Tomorrow
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Checklist Body if type === 'list' */}
        {item.type === "list" && item.checklist && (
          <div className="mt-3 space-y-1.5">
            {item.checklist.map((ci) => (
              <label
                key={ci.id}
                className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg p-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
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
                  className={`text-xs text-zinc-800 dark:text-zinc-200 ${
                    ci.completed
                      ? "line-through text-zinc-400 dark:text-zinc-500"
                      : ""
                  }`}
                >
                  {ci.text}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Note / Text Content */}
        {item.content && (
          <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
            {item.content}
          </p>
        )}

        {/* Audio Player */}
        {audioUrl && (
          <div className="mt-3">
            <AudioPlayer src={audioUrl} />
          </div>
        )}
      </div>

      {/* Footer: Tags & Timestamp */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800/60">
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[11px] px-1.5 py-0 font-normal">
              {tag}
            </Badge>
          ))}
        </div>
        <span className="text-[11px] text-zinc-400 font-mono">
          {new Date(item.createdAt).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}
