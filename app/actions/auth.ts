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

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: {
    _id: string;
    name: string;
    email: string;
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

