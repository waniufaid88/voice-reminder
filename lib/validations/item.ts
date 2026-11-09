import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1, "Checklist item cannot be empty"),
  completed: z.boolean(),
});

export const itemSchema = z.object({
  type: z.enum(["note", "reminder", "list"]),
  title: z.string().trim().min(1, "Title is required"),
  content: z.string(),
  dueDateString: z.string().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  tags: z.array(z.string()),
});

export type ItemFormValues = z.infer<typeof itemSchema>;
