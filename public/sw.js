// Service Worker for VoiceReminder Web Push Notifications & Background Actions

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

  const itemId = data.itemId || data.data?.itemId;
  const tag = itemId ? `reminder-${itemId}` : `reminder-${Date.now()}`;

  const options = {
    body: data.body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag,
    renotify: true,
    requireInteraction: true,
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

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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
