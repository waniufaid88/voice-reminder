// Service Worker for VoiceReminder Web Push Notifications & Background Actions

const recentNotifTimestamps = new Map();

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push event
self.addEventListener("push", (event) => {
  let data = {
    title: "⏰ Reminder Alert",
    body: "You have a reminder scheduled right now!",
    itemId: null,
    url: "/",
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const origin = self.location.origin || (self.registration ? new URL(self.registration.scope).origin : "");
  const itemId = data.itemId || data.data?.itemId;
  const teamId = data.teamId || data.data?.teamId;
  const targetUrl = data.url || (itemId ? `/?reminderId=${itemId}${teamId ? `&teamId=${teamId}` : ""}` : "/");

  // Deduplicate rapid duplicate push deliveries for the exact same reminder within 5 seconds
  // while ensuring event.waitUntil(showNotification) is ALWAYS executed (browser requirement)
  const now = Date.now();
  if (itemId) {
    recentNotifTimestamps.set(itemId, now);
    if (recentNotifTimestamps.size > 100) {
      const oldestKey = recentNotifTimestamps.keys().next().value;
      if (oldestKey) recentNotifTimestamps.delete(oldestKey);
    }
  }

  // Use unique tag per reminder alert to ensure Android mobile plays sound and vibrates for every reminder
  const tag = `reminder-${itemId || "alert"}-${Date.now()}`;

  const iconUrl = origin ? `${origin}/icon-192.png` : "/icon-192.png";
  const badgeUrl = origin ? `${origin}/badge-72.png` : "/badge-72.png";

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: badgeUrl,
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 250, 500, 250, 500, 250, 500],
    data: {
      url: targetUrl,
      itemId,
      teamId,
      title: data.title,
      content: data.body,
      receivedAt: Date.now(),
    },
    actions: [
      {
        action: "done",
        title: "✓ Mark Done",
      },
      {
        action: "snooze",
        title: "💤 Snooze 15m",
      },
    ],
  };

  // Robust display: ensure showNotification never fails silently on mobile Android Chrome
  const showNotificationPromise = self.registration
    .showNotification(data.title, options)
    .catch((err) => {
      console.warn("[sw.js] showNotification with full options failed, retrying simplified:", err);
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: iconUrl,
        badge: badgeUrl,
        tag,
        data: {
          url: targetUrl,
          itemId,
          teamId,
        },
      });
    });

  const notifyClientsPromise = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((client) => {
        try {
          client.postMessage({
            type: "PUSH_REMINDER_NOTIFICATION",
            itemId,
            teamId,
            title: data.title,
            content: data.body,
          });
        } catch {
          // Window client might be closing
        }
      });
    })
    .catch(() => {});

  event.waitUntil(Promise.all([showNotificationPromise, notifyClientsPromise]));
});

// Handle notification click and action buttons
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  const itemId = data.itemId;
  const teamId = data.teamId;

  notification.close();

  // Action button: "done"
  if (action === "done" && itemId) {
    event.waitUntil(
      fetch("/api/notifications/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", itemId }),
      }).catch((err) => {
        console.error("Failed to execute done action in background:", err);
      })
    );
    return;
  }

  // Action button: "snooze"
  if (action === "snooze" && itemId) {
    recentNotifTimestamps.delete(itemId);
    event.waitUntil(
      fetch("/api/notifications/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", itemId, minutes: 15 }),
      }).catch((err) => {
        console.error("Failed to execute snooze action in background:", err);
      })
    );
    return;
  }

  // Clicked notification body -> open / focus website tab and navigate to reminder
  const targetUrl = data.url || (itemId ? `/?reminderId=${itemId}${teamId ? `&teamId=${teamId}` : ""}` : "/");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          try {
            client.postMessage({
              type: "NAVIGATE_TO_REMINDER",
              itemId,
              teamId,
            });
          } catch {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
