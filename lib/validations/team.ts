import { z } from "zod";

/**
 * Zod validation schema for Team creation and editing.
 * Rules:
 * - Team name must be greater than 2 characters (at least 3 characters) up to 50 characters.
 * - Team description must be 0 to 200 characters.
 */
export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Team name must be greater than 2 characters (at least 3 characters)")
    .max(50, "Team name must not exceed 50 characters"),
  description: z
    .string()
    .trim()
    .max(200, "Team description must not exceed 200 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type TeamInput = z.infer<typeof teamSchema>;
