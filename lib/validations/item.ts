import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1, "Checklist item cannot be empty"),
  completed: z.boolean(),
});

export const itemSchema = z
  .object({
    type: z.enum(["note", "reminder", "list"]),
    title: z.string().trim().min(1, "Title is required"),
    content: z.string(),
    dueDateString: z.string().optional(),
    isDaily: z.boolean().optional(),
    recurrenceMode: z.enum(["once", "daily", "custom"]).optional(),
    recurrenceDays: z.array(z.number()).optional(),
    checklist: z.array(checklistItemSchema).optional(),
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
  );

export type ItemFormValues = z.infer<typeof itemSchema>;
