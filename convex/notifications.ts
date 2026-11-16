import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Saves or updates a Web Push subscription for an authenticated user.
 */
export const saveSubscription = mutation({
  args: {
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushSubscriptions", {
      userId: args.userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Removes a Web Push subscription by its endpoint (e.g. when user revokes permission).
 */
export const removeSubscriptionByEndpoint = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});

/**
 * Gets all active push subscriptions for a user.
 */
export const getSubscriptionsByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const internalGetSubscriptionsByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Retrieves a reminder item for Web Push notification dispatch.
 */
export const getItemForPush = query({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});

export const internalGetItemForPush = internalQuery({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.itemId);
  },
});

/**
 * Triggered automatically by Convex scheduler at a reminder's exact due date.
 */
export const triggerScheduledReminder = internalMutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    // Do not notify if reminder was already completed or cancelled
    if (item.reminderStatus !== "pending") return;
    if (!item.dueDate) return;

    // Mark as notified and record timestamp
    await ctx.db.patch(args.itemId, {
      isNotified: true,
      lastAlertedAt: Date.now(),
    });

    // Schedule background push dispatch action
    await ctx.scheduler.runAfter(
      0,
      internal.pushActions.dispatchPushAction,
      { itemId: args.itemId }
    );
  },
});

/**
 * Safety catch-all to detect any due reminders that have not been notified.
 */
export const checkDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Query pending reminders
    const reminders = await ctx.db
      .query("items")
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "reminder"),
          q.eq(q.field("reminderStatus"), "pending"),
          q.neq(q.field("dueDate"), undefined)
        )
      )
      .collect();

    for (const r of reminders) {
      if (
        r.dueDate &&
        r.dueDate <= now &&
        !r.isNotified
      ) {
        await ctx.db.patch(r._id, {
          isNotified: true,
          lastAlertedAt: now,
        });

        await ctx.scheduler.runAfter(
          0,
          internal.pushActions.dispatchPushAction,
          { itemId: r._id }
        );
      }
    }
  },
});

/**
 * Internal mutation to bulk remove expired/dead endpoints.
 */
export const removeExpiredEndpoints = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const endpoint of args.endpoints) {
      const sub = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .first();
      if (sub) {
        await ctx.db.delete(sub._id);
      }
    }
  },
});
