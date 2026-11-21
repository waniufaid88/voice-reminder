"use server";

import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from "@/lib/auth-crypto";
import {
  setSessionCookie,
  getSessionCookie,
  deleteSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import { headers } from "next/headers";
import { sendPasswordResetEmail } from "@/lib/mailer";

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    _id: string;
    name: string;
    email: string;
    image?: string;
  };
}

export async function registerAction(formData: FormData): Promise<AuthResponse> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!name || name.length < 2) {
    return { success: false, error: "Please enter your name (at least 2 characters)." };
  }
  if (!email || !email.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!password || password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  try {
    const passwordHash = await hashPassword(password);
    const userId = await convexServer.mutation(api.users.create, {
      name,
      email,
      passwordHash,
    });

    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

    await convexServer.mutation(api.sessions.createSession, {
      userId,
      token,
      expiresAt,
    });

    await setSessionCookie(token);

    return {
      success: true,
      user: {
        _id: userId,
        name,
        email,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to register account.";
    return {
      success: false,
      error: message,
    };
  }
}

export async function loginAction(formData: FormData): Promise<AuthResponse> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  try {
    const user = await convexServer.query(api.users.getByEmail, { email });
    if (!user) {
      return { success: false, error: "Invalid email or password." };
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return { success: false, error: "Invalid email or password." };
    }

    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

    await convexServer.mutation(api.sessions.createSession, {
      userId: user._id,
      token,
      expiresAt,
    });

    await setSessionCookie(token);

    return {
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to log in.";
    return {
      success: false,
      error: message,
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const token = await getSessionCookie();
    if (token) {
      await convexServer.mutation(api.sessions.removeSession, { token });
    }
  } catch {
    // Ignore error if session already deleted
  } finally {
    await deleteSessionCookie();
  }
  return { success: true };
}

export async function getCurrentUserAction() {
  try {
    const token = await getSessionCookie();
    if (!token) return null;

    const result = await convexServer.query(api.sessions.validateSession, {
      token,
    });
    return result?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Handles requesting a password reset email.
 * Applies rate limiting via Convex and dispatches email with secure reset link.
 */
export async function forgotPasswordAction(
  email: string
): Promise<{ success: boolean; message: string; rateLimited?: boolean }> {
  const trimmedEmail = email?.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return {
      success: false,
      message: "Please enter a valid email address.",
    };
  }

  try {
    const res = await convexServer.mutation(api.passwordReset.requestReset, {
      email: trimmedEmail,
    });

    if (res.userFound && res.token) {
      const headersList = await headers();
      const host = headersList.get("host") || "localhost:3000";
      const proto = headersList.get("x-forwarded-proto") || "http";
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
      const resetUrl = `${baseUrl}/reset-password?token=${res.token}`;

      await sendPasswordResetEmail({
        to: res.email || trimmedEmail,
        name: res.name || "User",
        resetUrl,
      });
    }

    return {
      success: true,
      message:
        "If an account is associated with this email, we have sent a secure password reset link. Please check your inbox.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process request.";
    const isRateLimit = msg.toLowerCase().includes("too many password reset requests");
    return {
      success: false,
      message: msg,
      rateLimited: isRateLimit,
    };
  }
}

/**
 * Validates a password reset token from URL query string.
 */
export async function validateResetTokenAction(
  token: string
): Promise<{ valid: boolean; email?: string; error?: string }> {
  if (!token || !token.trim()) {
    return { valid: false, error: "Missing reset token." };
  }

  try {
    const res = await convexServer.query(api.passwordReset.validateToken, {
      token: token.trim(),
    });
    return res;
  } catch {
    return { valid: false, error: "Failed to validate reset token." };
  }
}

/**
 * Resets user's password using the verified reset token.
 */
export async function resetPasswordAction(
  token: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!token || !token.trim()) {
    return { success: false, message: "Missing reset token." };
  }

  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      message: "Password must be at least 6 characters long.",
    };
  }

  try {
    const newPasswordHash = await hashPassword(newPassword);
    await convexServer.mutation(api.passwordReset.resetPassword, {
      token: token.trim(),
      newPasswordHash,
    });

    return {
      success: true,
      message: "Your password has been reset successfully! You can now sign in.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reset password.";
    return {
      success: false,
      message: msg,
    };
  }
}

