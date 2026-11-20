import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .first();

    if (existing) {
      throw new Error("A user with this email already exists");
    }

    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase().trim(),
      passwordHash: args.passwordHash,
      name: args.name.trim(),
      createdAt: Date.now(),
    });

    return userId;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    removeImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const patch: {
      name?: string;
      image?: string | undefined;
      imageStorageId?: any;
    } = {};

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (trimmed.length < 2) {
        throw new Error("Name must be at least 2 characters");
      }
      patch.name = trimmed;
    }

    const shouldRemove = args.removeImage === true || args.image === "";

    if (shouldRemove) {
      // User explicitly requested to remove the profile picture
      if (user.imageStorageId) {
        try {
          await ctx.storage.delete(user.imageStorageId);
        } catch {}
      }
      patch.image = undefined;
      patch.imageStorageId = undefined;
    } else if (args.imageStorageId !== undefined) {
      // User uploaded a new picture to Convex storage
      if (user.imageStorageId && user.imageStorageId !== args.imageStorageId) {
        try {
          await ctx.storage.delete(user.imageStorageId);
        } catch {}
      }
      patch.imageStorageId = args.imageStorageId;
      const url = await ctx.storage.getUrl(args.imageStorageId);
      patch.image = url || undefined;
    } else if (args.image !== undefined) {
      patch.image = args.image;
    }

    await ctx.db.patch(args.userId, patch);

    const updated = await ctx.db.get(args.userId);
    let finalImage = updated?.image;
    if (!finalImage && updated?.imageStorageId && !shouldRemove) {
      finalImage = (await ctx.storage.getUrl(updated.imageStorageId)) || undefined;
    }
    if (shouldRemove) {
      finalImage = undefined;
    }

    return {
      _id: updated!._id,
      name: updated!.name,
      email: updated!.email,
      image: finalImage,
    };
  },
});

export const getProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    let image = user.image;
    if (image === "") {
      image = undefined;
    }
    if (!image && user.imageStorageId) {
      image = (await ctx.storage.getUrl(user.imageStorageId)) || undefined;
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: image || undefined,
      createdAt: user.createdAt,
    };
  },
});

