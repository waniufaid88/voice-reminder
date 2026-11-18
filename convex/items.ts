import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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

    // Only personal items (teamId === undefined)
    const personalItems = items.filter((i) => i.teamId === undefined);

    // Sort pinned items first, then by createdAt desc
    return personalItems.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
  },
});

export const listActiveReminders = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // 1. Personal pending reminders
    const personalReminders = await ctx.db
      .query("items")
      .withIndex("by_userId_type", (q) =>
        q.eq("userId", args.userId).eq("type", "reminder")
      )
      .collect();

    const activeList = personalReminders.filter(
      (r) =>
        r.teamId === undefined &&
        r.reminderStatus === "pending" &&
        r.dueDate !== undefined
    );

    // 2. Team pending reminders for teams where user is an active member
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const m of memberships) {
      const teamReminders = await ctx.db
        .query("items")
        .withIndex("by_teamId_type", (q) =>
          q.eq("teamId", m.teamId).eq("type", "reminder")
        )
        .collect();

      for (const tr of teamReminders) {
        if (tr.reminderStatus === "pending" && tr.dueDate !== undefined) {
          if (!activeList.some((item) => item._id === tr._id)) {
            activeList.push(tr);
          }
        }
      }
    }

    return activeList;
  },
});

export const listByTeam = query({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify membership
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    const items = await ctx.db
      .query("items")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    return items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
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
    teamId: v.optional(v.id("teams")),
    creatorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // If saving a team reminder, verify user is an active member of that team
    if (args.teamId) {
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_userId", (q) =>
          q.eq("teamId", args.teamId!).eq("userId", args.userId)
        )
        .first();

      if (!membership) {
        throw new Error("You must be an active member of this team to add reminders.");
      }
    }

    const now = Date.now();
    let creatorName = args.creatorName;
    if (!creatorName && args.teamId) {
      const u = await ctx.db.get(args.userId);
      creatorName = u?.name || "Team member";
    }

    const itemId = await ctx.db.insert("items", {
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
      teamId: args.teamId,
      creatorName,
      createdAt: now,
      updatedAt: now,
    });

    if (
      args.type === "reminder" &&
      args.dueDate &&
      (args.reminderStatus ?? "pending") === "pending"
    ) {
      try {
        let scheduledJobId: any = undefined;
        if (args.dueDate <= now) {
          scheduledJobId = await ctx.scheduler.runAfter(
            0,
            internal.notifications.triggerScheduledReminder,
            { itemId }
          );
        } else {
          scheduledJobId = await ctx.scheduler.runAt(
            args.dueDate,
            internal.notifications.triggerScheduledReminder,
            { itemId }
          );
        }
        await ctx.db.patch(itemId, { scheduledJobId });
      } catch (err) {
        console.error("[items:create] Failed to schedule reminder job:", err);
      }
    }

    return itemId;
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    userId: v.optional(v.id("users")),
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
    teamId: v.optional(v.union(v.id("teams"), v.null())),
    isPinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { itemId, ...fields } = args;
    const existing = await ctx.db.get(itemId);
    if (!existing) throw new Error("Item not found");

    // Permission enforcement:
    // Personal reminders: only creator can edit
    // Team reminders: reminder creator, team admin, and team owner can edit
    if (fields.userId) {
      if (!existing.teamId) {
        if (existing.userId !== fields.userId) {
          throw new Error("Only the creator can edit this personal reminder.");
        }
      } else {
        const isCreator = existing.userId === fields.userId;
        let isAuthorized = isCreator;

        if (!isAuthorized) {
          const membership = await ctx.db
            .query("teamMembers")
            .withIndex("by_teamId_userId", (q) =>
              q.eq("teamId", existing.teamId!).eq("userId", fields.userId!)
            )
            .first();

          if (membership && (membership.role === "owner" || membership.role === "admin")) {
            isAuthorized = true;
          } else {
            const team = await ctx.db.get(existing.teamId!);
            if (team && team.createdById === fields.userId) {
              isAuthorized = true;
            }
          }
        }

        if (!isAuthorized) {
          throw new Error("Only the reminder creator, team admin, or team owner can edit this reminder.");
        }
      }
    }

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
    if (fields.teamId !== undefined) updates.teamId = fields.teamId === null ? undefined : fields.teamId;
    if (fields.isPinned !== undefined) updates.isPinned = fields.isPinned;

    const finalType = fields.type ?? existing.type;
    const finalStatus = fields.reminderStatus ?? existing.reminderStatus;
    const finalDueDate = fields.dueDate !== undefined ? fields.dueDate : existing.dueDate;
    const now = Date.now();

    const dueDateChanged = fields.dueDate !== undefined && fields.dueDate !== existing.dueDate;
    const statusChanged = fields.reminderStatus !== undefined && fields.reminderStatus !== existing.reminderStatus;
    const typeChanged = fields.type !== undefined && fields.type !== existing.type;

    if (dueDateChanged || statusChanged || typeChanged) {
      if (existing.scheduledJobId) {
        try {
          await ctx.scheduler.cancel(existing.scheduledJobId);
        } catch {
          // Ignore if job already executed
        }
        updates.scheduledJobId = undefined;
      }

      if (
        finalType === "reminder" &&
        finalStatus === "pending" &&
        finalDueDate &&
        finalDueDate > now
      ) {
        try {
          const scheduledJobId = await ctx.scheduler.runAt(
            finalDueDate,
            internal.notifications.triggerScheduledReminder,
            { itemId }
          );
          updates.scheduledJobId = scheduledJobId;
          updates.isNotified = false;
        } catch (err) {
          console.error("[items:update] Failed to schedule reminder job:", err);
        }
      }
    }

    await ctx.db.patch(itemId, updates);
  },
});

export const togglePin = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    const nextPinned = !Boolean(item.isPinned);
    await ctx.db.patch(args.itemId, {
      isPinned: nextPinned,
      updatedAt: Date.now(),
    });
    return nextPinned;
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

      if (item.scheduledJobId) {
        try {
          await ctx.scheduler.cancel(item.scheduledJobId);
        } catch {
          // Ignore if already cancelled or executed
        }
      }

      let scheduledJobId: any = undefined;
      try {
        scheduledJobId = await ctx.scheduler.runAt(
          nextDueDate,
          internal.notifications.triggerScheduledReminder,
          { itemId: args.itemId }
        );
      } catch (err) {
        console.error(
          "[items:toggleReminderStatus] Failed to reschedule recurring reminder:",
          err
        );
      }

      await ctx.db.patch(args.itemId, {
        dueDate: nextDueDate,
        reminderStatus: "pending",
        isNotified: false,
        scheduledJobId,
        updatedAt: Date.now(),
      });
      return { isRecurringAdvanced: true, nextDue: nextDueDate };
    }

    const newStatus = item.reminderStatus === "completed" ? "pending" : "completed";
    if (item.scheduledJobId) {
      try {
        await ctx.scheduler.cancel(item.scheduledJobId);
      } catch { }
    }

    let scheduledJobId: any = undefined;
    if (newStatus === "pending" && item.dueDate && item.dueDate > Date.now()) {
      try {
        scheduledJobId = await ctx.scheduler.runAt(
          item.dueDate,
          internal.notifications.triggerScheduledReminder,
          { itemId: args.itemId }
        );
      } catch (err) {
        console.error("[items:toggleReminderStatus] Failed to reschedule:", err);
      }
    }

    await ctx.db.patch(args.itemId, {
      reminderStatus: newStatus,
      isNotified: newStatus === "completed",
      scheduledJobId,
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

    if (item.scheduledJobId) {
      try {
        await ctx.scheduler.cancel(item.scheduledJobId);
      } catch { }
    }

    await ctx.db.patch(args.itemId, {
      isDaily: false,
      recurrenceMode: "once",
      reminderStatus: "completed",
      isNotified: true,
      scheduledJobId: undefined,
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

    if (item.scheduledJobId) {
      try {
        await ctx.scheduler.cancel(item.scheduledJobId);
      } catch { }
    }

    let scheduledJobId: any = undefined;
    try {
      scheduledJobId = await ctx.scheduler.runAt(
        newDueDate,
        internal.notifications.triggerScheduledReminder,
        { itemId: args.itemId }
      );
    } catch (err) {
      console.error("[items:snoozeReminder] Failed to schedule snoozed reminder:", err);
    }

    await ctx.db.patch(args.itemId, {
      dueDate: newDueDate,
      reminderStatus: "pending",
      isNotified: false,
      scheduledJobId,
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
  args: {
    itemId: v.id("items"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    // Permission enforcement:
    // Personal reminders: only creator can delete
    // Team reminders: reminder creator, team admin, and team owner can delete
    if (args.userId) {
      if (!item.teamId) {
        if (item.userId !== args.userId) {
          throw new Error("Only the creator can delete this personal reminder.");
        }
      } else {
        const isCreator = item.userId === args.userId;
        let isAuthorized = isCreator;

        if (!isAuthorized) {
          const membership = await ctx.db
            .query("teamMembers")
            .withIndex("by_teamId_userId", (q) =>
              q.eq("teamId", item.teamId!).eq("userId", args.userId!)
            )
            .first();

          if (membership && (membership.role === "owner" || membership.role === "admin")) {
            isAuthorized = true;
          } else {
            const team = await ctx.db.get(item.teamId!);
            if (team && team.createdById === args.userId) {
              isAuthorized = true;
            }
          }
        }

        if (!isAuthorized) {
          throw new Error("Only the reminder creator, team admin, or team owner can delete this reminder.");
        }
      }
    }

    if (item.scheduledJobId) {
      try {
        await ctx.scheduler.cancel(item.scheduledJobId);
      } catch { }
    }
    if (item.audioStorageId) {
      try {
        await ctx.storage.delete(item.audioStorageId);
      } catch {
        // Storage file deletion fallback
      }
    }
    await ctx.db.delete(args.itemId);
  },
});

export const getReminderCounts = query({
  args: {
    userId: v.id("users"),
    teamId: v.optional(v.id("teams")),
    clientNow: v.optional(v.number()),
    searchQuery: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = args.clientNow ?? Date.now();
    let reminders;

    if (args.teamId) {
      // Check membership
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_userId", (q) =>
          q.eq("teamId", args.teamId!).eq("userId", args.userId)
        )
        .first();
      if (!membership) throw new Error("You are not a member of this team.");

      reminders = await ctx.db
        .query("items")
        .withIndex("by_teamId_type", (q) =>
          q.eq("teamId", args.teamId!).eq("type", "reminder")
        )
        .collect();
    } else {
      const allUserReminders = await ctx.db
        .query("items")
        .withIndex("by_userId_type", (q) =>
          q.eq("userId", args.userId).eq("type", "reminder")
        )
        .collect();
      reminders = allUserReminders.filter((r) => r.teamId === undefined);
    }

    let upcoming = 0;
    let overdue = 0;
    let completed = 0;

    const queryFilter = args.searchQuery?.trim().toLowerCase();
    const tagFilter = args.tag;

    for (const r of reminders) {
      if (tagFilter && !r.tags.includes(tagFilter)) continue;
      if (queryFilter) {
        const matchesTitle = r.title.toLowerCase().includes(queryFilter);
        const matchesContent = r.content.toLowerCase().includes(queryFilter);
        const matchesTag = r.tags.some((t) => t.toLowerCase().includes(queryFilter));
        const matchesChecklist = r.checklist?.some((ci) =>
          ci.text.toLowerCase().includes(queryFilter)
        );
        if (!matchesTitle && !matchesContent && !matchesTag && !matchesChecklist) continue;
      }

      if (r.reminderStatus === "completed") {
        completed++;
      } else if (r.dueDate !== undefined && r.dueDate > now) {
        upcoming++;
      } else {
        overdue++;
      }
    }

    return {
      upcoming,
      overdue,
      completed,
      total: upcoming + overdue + completed,
    };
  },
});

export const getRemindersByTab = query({
  args: {
    userId: v.id("users"),
    teamId: v.optional(v.id("teams")),
    tab: v.union(
      v.literal("upcoming"),
      v.literal("overdue"),
      v.literal("completed")
    ),
    limit: v.number(),
    clientNow: v.optional(v.number()),
    searchQuery: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = args.clientNow ?? Date.now();
    let reminders;

    if (args.teamId) {
      // Check membership
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_userId", (q) =>
          q.eq("teamId", args.teamId!).eq("userId", args.userId)
        )
        .first();
      if (!membership) throw new Error("You are not a member of this team.");

      reminders = await ctx.db
        .query("items")
        .withIndex("by_teamId_type", (q) =>
          q.eq("teamId", args.teamId!).eq("type", "reminder")
        )
        .collect();
    } else {
      const allUserReminders = await ctx.db
        .query("items")
        .withIndex("by_userId_type", (q) =>
          q.eq("userId", args.userId).eq("type", "reminder")
        )
        .collect();
      reminders = allUserReminders.filter((r) => r.teamId === undefined);
    }

    const queryFilter = args.searchQuery?.trim().toLowerCase();
    const tagFilter = args.tag;

    let filtered = reminders.filter((r) => {
      if (tagFilter && !r.tags.includes(tagFilter)) return false;
      if (queryFilter) {
        const matchesTitle = r.title.toLowerCase().includes(queryFilter);
        const matchesContent = r.content.toLowerCase().includes(queryFilter);
        const matchesTag = r.tags.some((t) => t.toLowerCase().includes(queryFilter));
        const matchesChecklist = r.checklist?.some((ci) =>
          ci.text.toLowerCase().includes(queryFilter)
        );
        if (!matchesTitle && !matchesContent && !matchesTag && !matchesChecklist) return false;
      }
      return true;
    });

    const pinComparator = (a: any, b: any) => {
      const aPinned = Boolean(a.isPinned);
      const bPinned = Boolean(b.isPinned);
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      return 0;
    };

    if (args.tab === "upcoming") {
      filtered = filtered
        .filter(
          (r) =>
            r.reminderStatus !== "completed" &&
            r.dueDate !== undefined &&
            r.dueDate > now
        )
        .sort((a, b) => pinComparator(a, b) || (a.dueDate || 0) - (b.dueDate || 0));
    } else if (args.tab === "overdue") {
      filtered = filtered
        .filter(
          (r) =>
            r.reminderStatus !== "completed" &&
            (!r.dueDate || r.dueDate <= now)
        )
        .sort((a, b) => pinComparator(a, b) || (a.dueDate || 0) - (b.dueDate || 0));
    } else if (args.tab === "completed") {
      filtered = filtered
        .filter((r) => r.reminderStatus === "completed")
        .sort(
          (a, b) =>
            pinComparator(a, b) ||
            (b.updatedAt || b.dueDate || 0) - (a.updatedAt || a.dueDate || 0)
        );
    }

    const totalCount = filtered.length;
    const items = filtered.slice(0, args.limit);
    const hasMore = totalCount > args.limit;

    return {
      items,
      totalCount,
      hasMore,
    };
  },
});

