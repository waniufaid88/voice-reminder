import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z
    .string()
    .trim()
    .min(1, "Checklist item cannot be empty")
    .max(200, "Checklist item cannot exceed 200 characters"),
  completed: z.boolean(),
});

export const itemSchema = z
  .object({
    type: z.enum(["note", "reminder", "list"]),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(120, "Title cannot exceed 120 characters"),
    content: z
      .string()
      .max(3000, "Content cannot exceed 3000 characters"),
    dueDateString: z.string().optional(),
    isDaily: z.boolean().optional(),
    recurrenceMode: z.enum(["once", "daily", "custom"]).optional(),
    recurrenceDays: z.array(z.number()).optional(),
    checklist: z
      .array(checklistItemSchema)
      .max(50, "List cannot exceed 50 items")
      .optional(),
    tags: z.array(z.string()),
  })
  .refine(
    (data) => {
      if (data.type === "reminder") {
        return Boolean(data.dueDateString && data.dueDateString.trim().length > 0);
      }
      return true;
    },
    {
      message: "Please select a due date and time for the reminder",
      path: ["dueDateString"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "list") {
        return Boolean(data.checklist && data.checklist.length > 0);
      }
      return true;
    },
    {
      message: "A checklist must have at least one item",
      path: ["checklist"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "note") {
        return Boolean(
          (data.content && data.content.trim().length > 0) ||
            (data.title && data.title.trim().length > 0)
        );
      }
      return true;
    },
    {
      message: "Note content or title is required",
      path: ["content"],
    }
  );

export type ItemFormValues = z.infer<typeof itemSchema>;
