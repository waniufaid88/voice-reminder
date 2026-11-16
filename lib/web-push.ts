// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require("web-push");
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from "./vapid";

// Initialize VAPID details for Web Push API
try {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (err) {
  console.error("[web-push] Failed to configure VAPID details:", err);
}

export interface PushPayload {
  title: string;
  body: string;
  itemId?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendWebPushNotification(
  subscription: SubscriptionKeys,
  payload: PushPayload
): Promise<{ success: boolean; expired?: boolean; error?: string }> {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 24 * 60 * 60, // 24 hours Time-To-Live
        urgency: "high",
      }
    );

    return { success: true };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 410 || status === 404) {
      // Subscription has expired or user revoked notification permission in browser
      return { success: false, expired: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[web-push] Push delivery error:", { status, message });
    return { success: false, error: message };
  }
}
