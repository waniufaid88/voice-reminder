"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require("web-push");

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BD7Wz7V2_iDn7hGW8w9RzIzD_nFNOK8NEXAkuL6iqCLh5Dzff_UWmVtMd3WHOmOYoQDSuNCTaU9MeESI1We3K60";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ifSgEsxZmn0vqAH9zqALPluRiIuNV70L_DeYH4Nb39c";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@voicereminder.app";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.error("[pushActions] Error initializing VAPID details:", err);
}

/**
 * Dispatches a Web Push notification to all active devices registered by the reminder's owner.
 */
export const dispatchPushAction = internalAction({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    try {
      const item = await ctx.runQuery(
        internal.notifications.internalGetItemForPush,
        { itemId: args.itemId }
      );

      if (!item) {
        console.warn(`[pushActions] Item ${args.itemId} not found`);
        return;
      }

      if (item.reminderStatus === "completed") {
        return;
      }

      const subscriptions = await ctx.runQuery(
        internal.notifications.internalGetSubscriptionsByUser,
        { userId: item.userId }
      );

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`[pushActions] No push subscriptions for user ${item.userId}`);
        return;
      }

      const payload = JSON.stringify({
        title: `⏰ Reminder: ${item.title}`,
        body: item.content || "Your scheduled reminder is due!",
        itemId: item._id,
        url: "/",
      });

      const expiredEndpoints: string[] = [];

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              payload,
              {
                TTL: 86400, // 24 hours
                urgency: "high",
              }
            );
          } catch (error: unknown) {
            const err = error as { statusCode?: number };
            if (err.statusCode === 410 || err.statusCode === 404) {
              expiredEndpoints.push(sub.endpoint);
            } else {
              console.error(
                `[pushActions] Failed to send push to ${sub.endpoint}:`,
                error
              );
            }
          }
        })
      );

      if (expiredEndpoints.length > 0) {
        await ctx.runMutation(internal.notifications.removeExpiredEndpoints, {
          endpoints: expiredEndpoints,
        });
      }
    } catch (err) {
      console.error("[pushActions] Error executing dispatchPushAction:", err);
    }
  },
});
