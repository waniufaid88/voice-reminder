import { ConvexHttpClient } from "convex/browser";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}

export const convexServer = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL
);

