import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Request a password reset link.
 * Implements strict rate-limiting: maximum 3 requests per email within a 15-minute window.
 */
export const requestReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.toLowerCase().trim();
    const now = Date.now();
    const rateLimitWindowMs = 15 * 60 * 1000; // 15 minutes

    // Rate-limiting check: query recent tokens created for this email in the last 15 minutes
    const recentTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .filter((q) => q.gte(q.field("createdAt"), now - rateLimitWindowMs))
      .collect();

    if (recentTokens.length >= 3) {
      throw new Error(
        "Too many password reset requests. Please wait 15 minutes before trying again."
      );
    }

    // Check if user exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (!user) {
      // Don't reveal user existence; return generic success response
      return { success: true, userFound: false };
    }

    // Generate random 48-character hex token using crypto if available
    const array = new Uint8Array(24);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    const token = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = now + 60 * 60 * 1000; // 1 hour expiration

    await ctx.db.insert("passwordResetTokens", {
      email: normalizedEmail,
      token,
      expiresAt,
      createdAt: now,
    });

    return {
      success: true,
      userFound: true,
      token,
      email: user.email,
      name: user.name,
    };
  },
});

/**
 * Validates a password reset token.
 * Verifies that the token exists, is not expired, and has not already been used.
 */
export const validateToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || !args.token.trim()) {
      return { valid: false, error: "Reset token is missing or invalid." };
    }

    const record = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .first();

    if (!record) {
      return { valid: false, error: "Invalid password reset link." };
    }

    if (record.usedAt) {
      return {
        valid: false,
        error: "This password reset link has already been used.",
      };
    }

    if (record.expiresAt <= Date.now()) {
      return {
        valid: false,
        error: "This password reset link has expired. Please request a new one.",
      };
    }

    return {
      valid: true,
      email: record.email,
    };
  },
});

/**
 * Completes the password reset process.
 * Verifies token, updates the user's passwordHash, marks token as used,
 * and terminates any active sessions for the user.
 */
export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPasswordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const record = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .first();

    if (!record) {
      throw new Error("Invalid password reset token.");
    }

    if (record.usedAt) {
      throw new Error("This password reset link has already been used.");
    }

    if (record.expiresAt <= now) {
      throw new Error("This password reset link has expired. Please request a new one.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", record.email))
      .first();

    if (!user) {
      throw new Error("Associated user account not found.");
    }

    // Update password hash
    await ctx.db.patch(user._id, {
      passwordHash: args.newPasswordHash,
    });

    // Mark token as used so it cannot be reused
    await ctx.db.patch(record._id, {
      usedAt: now,
    });

    // Invalidate all active sessions for this user for security
    const activeSessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const session of activeSessions) {
      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});
