import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  items: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("note"), v.literal("reminder"), v.literal("list")),
    title: v.string(),
    content: v.string(),
    isPinned: v.boolean(),
    tags: v.array(v.string()),

    // Audio metadata
    audioStorageId: v.optional(v.id("_storage")),
    audioDuration: v.optional(v.number()),

    // Reminder specific fields
    dueDate: v.optional(v.number()),
    reminderStatus: v.optional(
      v.union(v.literal("pending"), v.literal("completed"))
    ),
    isNotified: v.optional(v.boolean()),
    isDaily: v.optional(v.boolean()),
    recurrenceMode: v.optional(
      v.union(v.literal("once"), v.literal("daily"), v.literal("custom"))
    ),
    recurrenceDays: v.optional(v.array(v.number())),
    scheduledJobId: v.optional(v.id("_scheduled_functions")),
    lastAlertedAt: v.optional(v.number()),

    // List specific fields
    checklist: v.optional(
      v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          completed: v.boolean(),
        })
      )
    ),

    // Team specific fields (optional: undefined for personal items)
    teamId: v.optional(v.id("teams")),
    creatorName: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "type"])
    .index("by_userId_dueDate", ["userId", "dueDate"])
    .index("by_teamId", ["teamId"])
    .index("by_teamId_type", ["teamId", "type"])
    .index("by_teamId_dueDate", ["teamId", "dueDate"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "type"],
    }),

  teams: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdById: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_createdById", ["createdById"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_userId", ["userId"])
    .index("by_teamId_userId", ["teamId", "userId"]),

  teamInvitations: defineTable({
    teamId: v.id("teams"),
    invitedEmail: v.string(),
    invitedById: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_teamId", ["teamId"])
    .index("by_invitedEmail", ["invitedEmail"])
    .index("by_invitedEmail_status", ["invitedEmail", "status"])
    .index("by_teamId_status", ["teamId", "status"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  passwordResetTokens: defineTable({
    email: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_email_createdAt", ["email", "createdAt"]),
});

