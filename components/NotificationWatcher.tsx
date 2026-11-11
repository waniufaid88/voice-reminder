"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface NotificationWatcherProps {
  userId: Id<"users">;
}

export function NotificationWatcher({ userId }: NotificationWatcherProps) {
  const activeReminders = useQuery(api.items.listActiveReminders, { userId });
  const markNotified = useMutation(api.items.markNotified);
  const toggleReminderStatus = useMutation(api.items.toggleReminderStatus);
  const snoozeReminder = useMutation(api.items.snoozeReminder);
  const stopDailyRepeat = useMutation(api.items.stopDailyRepeat);

  const [alertingItem, setAlertingItem] = useState<{
    _id: Id<"items">;
    title: string;
    content: string;
    isRecurring: boolean;
    recurrenceMode?: "once" | "daily" | "custom";
  } | null>(null);

  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // Synthesize a pleasant audio chime using Web Audio API
  const playChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Bell chime: 3 harmonious ascending notes (C5, E5, G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + index * 0.12);

        gain.gain.setValueAtTime(0, now + index * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, now + index * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.12);
        osc.stop(now + index * 0.12 + 0.85);
      });
    } catch {
      // AudioContext fallback
    }
  };

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Monitor reminders due timestamp
  useEffect(() => {
    if (!activeReminders || activeReminders.length === 0) return;

    const checkReminders = () => {
      const now = Date.now();
      for (const item of activeReminders) {
        if (!item.dueDate) continue;

        // Trigger if due within the last 10 minutes or right now, and not notified yet
        if (
          item.dueDate <= now &&
          item.dueDate >= now - 10 * 60 * 1000 &&
          !item.isNotified &&
          !notifiedIdsRef.current.has(item._id)
        ) {
          notifiedIdsRef.current.add(item._id);
          markNotified({ itemId: item._id });

          // Play chime sound
          playChime();

          const isRecurring =
            item.recurrenceMode === "daily" ||
            item.recurrenceMode === "custom" ||
            Boolean(item.isDaily);

          // Show in-app banner
          setAlertingItem({
            _id: item._id,
            title: item.title,
            content: item.content,
            isRecurring,
            recurrenceMode: item.recurrenceMode,
          });

          // Show Desktop browser notification
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(`⏰ Reminder: ${item.title}`, {
              body: item.content || "Your scheduled reminder is due!",
              icon: "/favicon.ico",
            });
          }
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [activeReminders, markNotified]);

  if (!alertingItem) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-amber-300 bg-amber-50/95 p-4 shadow-2xl backdrop-blur-md dark:border-amber-900/60 dark:bg-amber-950/90 animate-in slide-in-from-bottom-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30 text-xl">
          ⏰
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Reminder: {alertingItem.title}
            </h4>
            {alertingItem.isRecurring && (
              <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/80 dark:text-amber-200">
                🔁 Recurring
              </span>
            )}
          </div>
          {alertingItem.content && (
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300 line-clamp-2">
              {alertingItem.content}
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={async () => {
                const res = await toggleReminderStatus({ itemId: alertingItem._id });
                if (res?.isRecurringAdvanced) {
                  toast.success("Completed for today! Repeated schedule updated 🔁");
                } else {
                  toast.success("Reminder completed! 🎉");
                }
                setAlertingItem(null);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
            >
              {alertingItem.isRecurring ? "✓ Done for Today" : "✓ Mark Done"}
            </button>
            {alertingItem.isRecurring && (
              <button
                type="button"
                onClick={async () => {
                  await stopDailyRepeat({ itemId: alertingItem._id });
                  toast.success("Repeat cancelled & marked completed");
                  setAlertingItem(null);
                }}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
              >
                Stop Repeat
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await snoozeReminder({ itemId: alertingItem._id, minutes: 15 });
                toast.success("Snoozed for 15 mins");
                setAlertingItem(null);
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
            >
              +15m
            </button>
            <button
              type="button"
              onClick={async () => {
                await snoozeReminder({ itemId: alertingItem._id, minutes: 60 });
                toast.success("Snoozed for 1 hour");
                setAlertingItem(null);
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100"
            >
              +1h
            </button>
            <button
              type="button"
              onClick={() => setAlertingItem(null)}
              className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

