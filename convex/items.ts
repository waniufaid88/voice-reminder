import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getAudioUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Sort pinned items first, then by createdAt desc
    return items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
  },
});

export const listActiveReminders = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("items")
      .withIndex("by_userId_type", (q) =>
        q.eq("userId", args.userId).eq("type", "reminder")
      )
      .collect();

    return reminders.filter(
      (r) => r.reminderStatus === "pending" && r.dueDate !== undefined
    );
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(v.literal("note"), v.literal("reminder"), v.literal("list")),
    title: v.string(),
    content: v.string(),
    isPinned: v.optional(v.boolean()),
    tags: v.array(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    audioDuration: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    reminderStatus: v.optional(
      v.union(v.literal("pending"), v.literal("completed"))
    ),
    isDaily: v.optional(v.boolean()),
    recurrenceMode: v.optional(
      v.union(v.literal("once"), v.literal("daily"), v.literal("custom"))
    ),
    recurrenceDays: v.optional(v.array(v.number())),
    checklist: v.optional(
      v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          completed: v.boolean(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("items", {
      userId: args.userId,
      type: args.type,
      title: args.title.trim() || "Untitled",
      content: args.content,
      isPinned: args.isPinned ?? false,
      tags: args.tags,
      audioStorageId: args.audioStorageId,
      audioDuration: args.audioDuration,
      dueDate: args.dueDate,
      reminderStatus:
        args.type === "reminder" ? args.reminderStatus ?? "pending" : undefined,
      isDaily: args.isDaily,
      recurrenceMode: args.recurrenceMode ?? (args.isDaily ? "daily" : "once"),
      recurrenceDays: args.recurrenceDays,
      isNotified: false,
      checklist: args.checklist,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(
      v.union(v.literal("note"), v.literal("reminder"), v.literal("list"))
    ),
    tags: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    reminderStatus: v.optional(
      v.union(v.literal("pending"), v.literal("completed"))
    ),
    isDaily: v.optional(v.boolean()),
    recurrenceMode: v.optional(
      v.union(v.literal("once"), v.literal("daily"), v.literal("custom"))
    ),
    recurrenceDays: v.optional(v.array(v.number())),
    checklist: v.optional(
      v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          completed: v.boolean(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const { itemId, ...fields } = args;
    const existing = await ctx.db.get(itemId);
    if (!existing) throw new Error("Item not found");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.title !== undefined) updates.title = fields.title.trim() || "Untitled";
    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.type !== undefined) updates.type = fields.type;
    if (fields.tags !== undefined) updates.tags = fields.tags;
    if (fields.dueDate !== undefined) updates.dueDate = fields.dueDate;
    if (fields.reminderStatus !== undefined) updates.reminderStatus = fields.reminderStatus;
    if (fields.isDaily !== undefined) updates.isDaily = fields.isDaily;
    if (fields.recurrenceMode !== undefined) updates.recurrenceMode = fields.recurrenceMode;
    if (fields.recurrenceDays !== undefined) updates.recurrenceDays = fields.recurrenceDays;
    if (fields.checklist !== undefined) updates.checklist = fields.checklist;

    await ctx.db.patch(itemId, updates);
  },
});

export const togglePin = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await ctx.db.patch(args.itemId, {
      isPinned: !item.isPinned,
      updatedAt: Date.now(),
    });
  },
});

export const toggleChecklistItem = mutation({
  args: {
    itemId: v.id("items"),
    checklistItemId: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || !item.checklist) throw new Error("List item not found");

    const updatedChecklist = item.checklist.map((ci) => {
      if (ci.id === args.checklistItemId) {
        return { ...ci, completed: !ci.completed };
      }
      return ci;
    });

    await ctx.db.patch(args.itemId, {
      checklist: updatedChecklist,
      updatedAt: Date.now(),
    });
  },
});

export const toggleReminderStatus = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const isRecurring =
      item.recurrenceMode === "daily" ||
      item.recurrenceMode === "custom" ||
      item.isDaily;

    // If it's a recurring reminder and currently pending:
    // Completing it for today advances the scheduled dueDate to the next occurrence
    if (isRecurring && item.reminderStatus === "pending" && item.dueDate) {
      const now = Date.now();
      let nextDueDate = item.dueDate + 24 * 60 * 60 * 1000;

      if (
        item.recurrenceMode === "custom" &&
        item.recurrenceDays &&
        item.recurrenceDays.length > 0
      ) {
        const days = item.recurrenceDays;
        // Advance in 24-hour day increments to preserve the exact local time without server timezone distortion
        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
          const candidateMs = item.dueDate + dayOffset * 24 * 60 * 60 * 1000;
          const candidateDayOfWeek = new Date(candidateMs).getDay();
          if (days.includes(candidateDayOfWeek) && candidateMs > now) {
            nextDueDate = candidateMs;
            break;
          }
        }
      } else {
        // Daily reminder: advance by 24h increments until in the future
        while (nextDueDate <= now) {
          nextDueDate += 24 * 60 * 60 * 1000;
        }
      }

      await ctx.db.patch(args.itemId, {
        dueDate: nextDueDate,
        reminderStatus: "pending",
        isNotified: false,
        updatedAt: Date.now(),
      });
      return { isRecurringAdvanced: true, nextDue: nextDueDate };
    }

    const newStatus = item.reminderStatus === "completed" ? "pending" : "completed";
    await ctx.db.patch(args.itemId, {
      reminderStatus: newStatus,
      isNotified: newStatus === "completed",
      updatedAt: Date.now(),
    });
    return { isRecurringAdvanced: false, status: newStatus };
  },
});

export const stopDailyRepeat = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    await ctx.db.patch(args.itemId, {
      isDaily: false,
      recurrenceMode: "once",
      reminderStatus: "completed",
      isNotified: true,
      updatedAt: Date.now(),
    });
  },
});

export const snoozeReminder = mutation({
  args: {
    itemId: v.id("items"),
    minutes: v.number(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const baseTime = Math.max(item.dueDate ?? Date.now(), Date.now());
    const newDueDate = baseTime + args.minutes * 60 * 1000;

    await ctx.db.patch(args.itemId, {
      dueDate: newDueDate,
      reminderStatus: "pending",
      isNotified: false,
      updatedAt: Date.now(),
    });
  },
});

export const markNotified = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, { isNotified: true });
  },
});

export const deleteItem = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (item && item.audioStorageId) {
      try {
        await ctx.storage.delete(item.audioStorageId);
      } catch {
        // Storage file deletion fallback
      }
    }
    await ctx.db.delete(args.itemId);
  },
});

