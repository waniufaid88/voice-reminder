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

  const origin = self.location.origin || "";
  const itemId = data.itemId || data.data?.itemId;

  // Prevent multiple duplicate alerts for the same reminder within 60 seconds
  const now = Date.now();
  if (itemId && recentNotifTimestamps.has(itemId)) {
    const lastTime = recentNotifTimestamps.get(itemId);
    if (now - lastTime < 60000) {
      return;
    }
  }
  if (itemId) {
    recentNotifTimestamps.set(itemId, now);
    if (recentNotifTimestamps.size > 100) {
      const oldestKey = recentNotifTimestamps.keys().next().value;
      if (oldestKey) recentNotifTimestamps.delete(oldestKey);
    }
  }

  const tag = itemId ? `reminder-${itemId}` : `reminder-${Date.now()}`;

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
    vibrate: [300, 150, 300, 150, 300, 150, 500],
    data: {
      url: data.url || "/",
      itemId,
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
          url: data.url || "/",
          itemId,
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

  // Clicked notification body -> open / focus website tab
  const targetUrl = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
