import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
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

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "type"])
    .index("by_userId_dueDate", ["userId", "dueDate"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "type"],
    }),
});

