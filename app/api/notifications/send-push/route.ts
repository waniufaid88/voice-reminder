import { NextRequest, NextResponse } from "next/server";
import { convexServer } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { sendWebPushNotification } from "@/lib/web-push";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { itemId, userId, title, content } = body;

    let targetUserId = userId;
    let pushTitle = title || "⏰ Reminder Due";
    let pushBody = content || "You have a scheduled reminder!";
    let pushItemId = itemId;

    if (itemId) {
      const item = await convexServer.query(api.notifications.getItemForPush, {
        itemId: itemId as Id<"items">,
      });

      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      if (item.reminderStatus === "completed") {
        return NextResponse.json({ message: "Reminder is already completed" });
      }

      targetUserId = item.userId;
      pushTitle = `⏰ Reminder: ${item.title}`;
      pushBody = item.content || "Your scheduled reminder is due!";
      pushItemId = item._id;
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing userId or itemId" }, { status: 400 });
    }

    // Fetch user's registered Web Push subscriptions
    const subscriptions = await convexServer.query(
      api.notifications.getSubscriptionsByUser,
      {
        userId: targetUserId as Id<"users">,
      }
    );

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        message: "No active push subscriptions for user",
        sentCount: 0,
      });
    }

    let successCount = 0;
    const expiredEndpoints: string[] = [];

    const payload = {
      title: pushTitle,
      body: pushBody,
      itemId: pushItemId,
      url: "/",
    };

    // Dispatch Web Push to all devices registered by this user
    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendWebPushNotification(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
          payload
        );

        if (result.success) {
          successCount++;
        } else if (result.expired) {
          expiredEndpoints.push(sub.endpoint);
        }
      })
    );

    // Clean up expired or revoked subscriptions
    for (const endpoint of expiredEndpoints) {
      await convexServer.mutation(api.notifications.removeSubscriptionByEndpoint, {
        endpoint,
      });
    }

    // Mark reminder as notified in Convex
    if (itemId) {
      await convexServer.mutation(api.items.markNotified, {
        itemId: itemId as Id<"items">,
      });
    }

    return NextResponse.json({
      success: true,
      sentCount: successCount,
      expiredRemoved: expiredEndpoints.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/notifications/send-push] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
