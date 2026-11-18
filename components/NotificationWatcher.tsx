"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/vapid";

interface NotificationWatcherProps {
  userId?: Id<"users"> | null;
}

export function NotificationWatcher({ userId }: NotificationWatcherProps) {
  const activeReminders = useQuery(
    api.items.listActiveReminders,
    userId ? { userId } : "skip"
  );
  const markNotified = useMutation(api.items.markNotified);
  const toggleReminderStatus = useMutation(api.items.toggleReminderStatus);
  const snoozeReminder = useMutation(api.items.snoozeReminder);
  const stopDailyRepeat = useMutation(api.items.stopDailyRepeat);
  const saveSubscription = useMutation(api.notifications.saveSubscription);

  const [alertingItem, setAlertingItem] = useState<{
    _id: Id<"items">;
    title: string;
    content: string;
    isRecurring: boolean;
    recurrenceMode?: "once" | "daily" | "custom";
  } | null>(null);

  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alarmTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Immediately stops any ongoing alarm audio and clears all interval/timeout timers.
   */
  const stopAlarm = useCallback(() => {
    if (alarmTimerRef.current) {
      clearTimeout(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // Safe fallback
      }
      audioCtxRef.current = null;
    }
    setIsAlarmPlaying(false);
  }, []);

  /**
   * Starts a continuous, attention-grabbing Web Audio alarm for at least 15 seconds.
   * Plays a repeating melodious alert pattern every 1.25s until auto-stopped at 15s or silenced.
   */
  const startAlarm = useCallback(() => {
    stopAlarm();

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      setIsAlarmPlaying(true);

      const playChimeBurst = () => {
        if (!ctx || ctx.state === "closed") return;
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const now = ctx.currentTime;
        // Two-chord vibrant chime sequence: (C5, G5, C6)
        const notes = [
          { freq: 523.25, time: now },
          { freq: 783.99, time: now + 0.12 },
          { freq: 1046.5, time: now + 0.24 },
        ];

        notes.forEach(({ freq, time }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, time);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(time);
          osc.stop(time + 0.42);
        });
      };

      // Play immediate first burst
      playChimeBurst();

      // Play continuous chime pattern every 1.25s for 15 seconds
      alarmIntervalRef.current = setInterval(playChimeBurst, 1250);

      // Automatically stop after exactly 15 seconds (15,000 ms)
      alarmTimerRef.current = setTimeout(() => {
        stopAlarm();
      }, 15000);
    } catch (err) {
      console.warn("[NotificationWatcher] AudioContext failed to initialize:", err);
    }
  }, [stopAlarm]);

  /**
   * Subscribes the client browser to Web Push using the VAPID Public Key and registers with Convex.
   */
  const subscribeToWebPush = useCallback(
    async (registration: ServiceWorkerRegistration) => {
      if (!userId) return;
      try {
        let subscription = await registration.pushManager.getSubscription();
        const expectedAppServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        // Check if existing subscription has matching applicationServerKey to avoid FCM mismatch
        if (subscription && subscription.options && subscription.options.applicationServerKey) {
          const existingKey = new Uint8Array(subscription.options.applicationServerKey);
          let keyMatches = existingKey.length === expectedAppServerKey.length;
          if (keyMatches) {
            for (let i = 0; i < existingKey.length; i++) {
              if (existingKey[i] !== expectedAppServerKey[i]) {
                keyMatches = false;
                break;
              }
            }
          }
          if (!keyMatches) {
            console.log("[NotificationWatcher] Stale subscription key detected, resubscribing...");
            try {
              await subscription.unsubscribe();
            } catch {}
            subscription = null;
          }
        }

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: expectedAppServerKey as unknown as BufferSource,
          });
        }

        const subJson = subscription.toJSON();
        const rawP256dh = subscription.getKey ? subscription.getKey("p256dh") : null;
        const rawAuth = subscription.getKey ? subscription.getKey("auth") : null;

        // Prioritize browser's standard base64url keys from subJson.keys to ensure mobile FCM compatibility
        const p256dh =
          subJson.keys?.p256dh ||
          (rawP256dh
            ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawP256dh))))
            : undefined);
        const auth =
          subJson.keys?.auth ||
          (rawAuth
            ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth))))
            : undefined);

        if (subJson.endpoint && p256dh && auth) {
          await saveSubscription({
            userId,
            endpoint: subJson.endpoint,
            p256dh,
            auth,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          });
        }
      } catch (err) {
        console.warn("[NotificationWatcher] Push subscription error:", err);
      }
    },
    [userId, saveSubscription]
  );

  /**
   * Register service worker on mount & handle push subscription
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      setNotificationPermission("unsupported");
      return;
    }

    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      const dismissed = localStorage.getItem("push_permission_prompt_dismissed");
      if (Notification.permission === "default" && !dismissed) {
        setShowPermissionBanner(true);
      }
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if ("Notification" in window && Notification.permission === "granted") {
          subscribeToWebPush(reg);
        }
      })
      .catch((err) => {
        console.warn("[NotificationWatcher] SW registration error:", err);
      });
  }, [subscribeToWebPush]);

  /**
   * Automatically ensure Web Push is subscribed whenever userId becomes available.
   * Eliminates the mobile race condition where userId was null on first mount.
   */
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    navigator.serviceWorker.ready
      .then((reg) => {
        subscribeToWebPush(reg);
      })
      .catch((err) => {
        console.warn("[NotificationWatcher] serviceWorker.ready error:", err);
      });
  }, [userId, subscribeToWebPush]);

  /**
   * User interaction listener to pre-warm audio context (handles browser autoplay policies)
   */
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          ctx.close();
        }
      } catch {
        // Ignore pre-warm errors
      }
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };

    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      stopAlarm();
    };
  }, [stopAlarm]);

  /**
   * Monitor active reminders and trigger in-app alert + 15s alarm sound when due
   */
  useEffect(() => {
    if (!activeReminders || activeReminders.length === 0) return;

    const checkReminders = () => {
      const now = Date.now();
      for (const item of activeReminders) {
        if (!item.dueDate) continue;

        // Trigger if due right now or within the last 10 minutes
        const isDue = item.dueDate <= now && item.dueDate >= now - 10 * 60 * 1000;
        const alertKey = `${item._id}_${item.dueDate}`;
        const hasAlertedLocally =
          notifiedIdsRef.current.has(alertKey) ||
          (typeof window !== "undefined" &&
            sessionStorage.getItem(`alerted_${alertKey}`) === "true");

        if (isDue && !hasAlertedLocally) {
          notifiedIdsRef.current.add(alertKey);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem(`alerted_${alertKey}`, "true");
            } catch {}
          }

          // Mark notified in database so server crons know it was processed
          markNotified({ itemId: item._id });

          // Start continuous 15-second alarm sound
          startAlarm();

          const isRecurring =
            item.recurrenceMode === "daily" ||
            item.recurrenceMode === "custom" ||
            Boolean(item.isDaily);

          // Display in-app interactive alarm banner
          setAlertingItem({
            _id: item._id,
            title: item.title,
            content: item.content,
            isRecurring,
            recurrenceMode: item.recurrenceMode,
          });

          // Show browser notification if permission granted (mobile Android Chrome requires ServiceWorker)
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const notifTitle = item.teamId
              ? `⏰ [Team] ${item.title}`
              : `⏰ Reminder: ${item.title}`;
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const notifOptions = {
              body: item.content || "Your scheduled reminder is due!",
              icon: origin ? `${origin}/icon-192.png` : "/icon-192.png",
              badge: origin ? `${origin}/badge-72.png` : "/badge-72.png",
              tag: `reminder-${item._id}`,
              renotify: true,
              requireInteraction: true,
              silent: false,
              vibrate: [500, 250, 500, 250, 500, 250, 500],
              data: {
                url: "/",
                itemId: item._id,
              },
            };

            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.ready
                .then((reg) => {
                  reg.showNotification(notifTitle, notifOptions);
                })
                .catch(() => {
                  try {
                    new Notification(notifTitle, notifOptions);
                  } catch {}
                });
            } else {
              try {
                new Notification(notifTitle, notifOptions);
              } catch {}
            }
          }
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 5000); // Check every 5 seconds for timely alerts

    return () => clearInterval(interval);
  }, [activeReminders, markNotified, startAlarm]);

  /**
   * Listen for push events relayed from Service Worker when phone is backgrounded or tab unfocused
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_REMINDER_NOTIFICATION") {
        startAlarm();
        if (event.data.itemId) {
          setAlertingItem({
            _id: event.data.itemId as Id<"items">,
            title: event.data.title || "Reminder",
            content: event.data.content || "",
            isRecurring: false,
          });
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [startAlarm]);

  /**
   * Action handler: Mark Done / Done for Today
   */
  const handleMarkDone = async () => {
    if (!alertingItem) return;
    stopAlarm();
    try {
      const res = await toggleReminderStatus({ itemId: alertingItem._id });
      if (res?.isRecurringAdvanced) {
        toast.success("Completed for today! Repeated schedule updated 🔁");
      } else {
        toast.success("Reminder completed! 🎉");
      }
    } catch {
      toast.error("Failed to mark reminder done");
    } finally {
      setAlertingItem(null);
    }
  };

  /**
   * Action handler: Snooze
   */
  const handleSnooze = async (minutes: number) => {
    if (!alertingItem) return;
    stopAlarm();
    try {
      await snoozeReminder({ itemId: alertingItem._id, minutes });
      toast.success(`Snoozed for ${minutes >= 60 ? `${minutes / 60} hour` : `${minutes} mins`} 💤`);
    } catch {
      toast.error("Failed to snooze reminder");
    } finally {
      setAlertingItem(null);
    }
  };

  /**
   * Action handler: Stop Repeat
   */
  const handleStopRepeat = async () => {
    if (!alertingItem) return;
    stopAlarm();
    try {
      await stopDailyRepeat({ itemId: alertingItem._id });
      toast.success("Repeat cancelled & marked completed");
    } catch {
      toast.error("Failed to stop repeat");
    } finally {
      setAlertingItem(null);
    }
  };

  /**
   * Action handler: Dismiss banner
   */
  const handleDismiss = () => {
    stopAlarm();
    setAlertingItem(null);
  };

  /**
   * Permission request handler for Web Push
   */
  const handleEnablePushNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Push notifications are not supported by this browser");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      setShowPermissionBanner(false);

      if (perm === "granted") {
        toast.success("Push notifications enabled! 🔔");
        const reg = await navigator.serviceWorker.ready;
        await subscribeToWebPush(reg);
      } else if (perm === "denied") {
        toast.error("Notification permission was denied. You can re-enable it in browser settings.");
      }
    } catch (err) {
      console.error("Failed to request notification permission:", err);
    }
  };

  const handleDismissPermissionBanner = () => {
    setShowPermissionBanner(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("push_permission_prompt_dismissed", "true");
    }
  };

  return (
    <>
      {/* Background Push Permission Prompt Card (if permission not yet granted) */}
      {showPermissionBanner && notificationPermission === "default" && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-indigo-900/60 dark:bg-zinc-900/95 animate-in slide-in-from-top-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md text-lg">
              🔔
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Enable Web Push Notifications
              </h5>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Get alerted on desktop and Android Chrome even when this tab is in the background or closed.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnablePushNotifications}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition-colors"
                >
                  Enable Notifications
                </button>
                <button
                  type="button"
                  onClick={handleDismissPermissionBanner}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Interactive Alarm Banner for Due Reminders */}
      {alertingItem && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 rounded-2xl border border-amber-300 bg-amber-50/95 p-4 shadow-2xl backdrop-blur-md dark:border-amber-900/60 dark:bg-amber-950/90 animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30 text-xl">
              ⏰
              {isAlarmPlaying && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 text-[8px] font-bold text-white items-center justify-center">
                    🔊
                  </span>
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="text-sm font-bold text-amber-950 dark:text-amber-100 truncate">
                  Reminder: {alertingItem.title}
                </h4>
                {alertingItem.isRecurring && (
                  <span className="rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/80 dark:text-amber-200">
                    🔁 Recurring
                  </span>
                )}
                {isAlarmPlaying && (
                  <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 animate-pulse dark:bg-red-950 dark:text-red-300">
                    Alarm Playing (15s)
                  </span>
                )}
              </div>

              {alertingItem.content && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300 line-clamp-2">
                  {alertingItem.content}
                </p>
              )}

              {/* Action buttons: Silence, Mark Done, Snooze, Dismiss */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {isAlarmPlaying && (
                  <button
                    type="button"
                    onClick={stopAlarm}
                    className="flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-500 transition-colors"
                  >
                    <span>🔇</span> Silence Alarm
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleMarkDone}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition-colors"
                >
                  {alertingItem.isRecurring ? "✓ Done for Today" : "✓ Mark Done"}
                </button>

                {alertingItem.isRecurring && (
                  <button
                    type="button"
                    onClick={handleStopRepeat}
                    className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100 transition-colors"
                  >
                    Stop Repeat
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSnooze(15)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100 transition-colors"
                >
                  💤 +15m
                </button>

                <button
                  type="button"
                  onClick={() => handleSnooze(60)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-100 transition-colors"
                >
                  💤 +1h
                </button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
