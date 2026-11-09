"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";

import { api } from "@/convex/_generated/api";
import { ItemRecord } from "./ItemCard";
import { itemSchema, ItemFormValues } from "@/lib/validations/item";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";

interface EditItemDialogProps {
  item: ItemRecord | null;
  onClose: () => void;
}

export function EditItemDialog({ item, onClose }: EditItemDialogProps) {
  const updateItem = useMutation(api.items.update);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      type: "note",
      title: "",
      content: "",
      dueDateString: "",
      checklist: [],
      tags: [],
    },
  });

  const { watch, setValue, reset } = form;
  const currentType = watch("type");
  const currentTags = watch("tags") || [];
  const currentChecklist = watch("checklist") || [];

  useEffect(() => {
    if (item) {
      reset({
        type: item.type,
        title: item.title,
        content: item.content || "",
        dueDateString: item.dueDate
          ? new Date(item.dueDate).toISOString().slice(0, 16)
          : "",
        checklist: item.checklist || [],
        tags: item.tags || [],
      });
    }
  }, [item, reset]);

  if (!item) return null;

  const handleAddTag = () => {
    let tag = newTagInput.trim();
    if (!tag) return;
    if (!tag.startsWith("#")) tag = "#" + tag;
    if (!currentTags.includes(tag)) {
      setValue("tags", [...currentTags, tag]);
    }
    setNewTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setValue(
      "tags",
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setValue("checklist", [
      ...currentChecklist,
      {
        id: Date.now().toString(),
        text: newChecklistText.trim(),
        completed: false,
      },
    ]);
    setNewChecklistText("");
  };

  const handleRemoveChecklistItem = (id: string) => {
    setValue(
      "checklist",
      currentChecklist.filter((ci) => ci.id !== id)
    );
  };

  const handleUpdateChecklistItem = (id: string, text: string) => {
    setValue(
      "checklist",
      currentChecklist.map((ci) => (ci.id === id ? { ...ci, text } : ci))
    );
  };

  const onSubmit = async (values: ItemFormValues) => {
    setIsSaving(true);
    try {
      const dueDate =
        values.type === "reminder" && values.dueDateString
          ? new Date(values.dueDateString).getTime()
          : undefined;

      await updateItem({
        itemId: item._id,
        title: values.title,
        content: values.content || "",
        type: values.type,
        tags: values.tags,
        dueDate,
        checklist: values.type === "list" ? values.checklist : undefined,
      });

      toast.success("Item updated successfully!");
      onClose();
    } catch {
      toast.error("Failed to update item.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle>Edit Item</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1"
        >
          {/* Category Tabs */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Category
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={currentType === "note" ? "default" : "secondary"}
                className={`flex-1 ${currentType === "note" ? "bg-indigo-600 text-white" : ""}`}
                onClick={() => setValue("type", "note")}
              >
                📝 Note
              </Button>
              <Button
                type="button"
                variant={currentType === "reminder" ? "default" : "secondary"}
                className={`flex-1 ${currentType === "reminder" ? "bg-amber-500 text-white hover:bg-amber-600" : ""}`}
                onClick={() => setValue("type", "reminder")}
              >
                ⏰ Reminder
              </Button>
              <Button
                type="button"
                variant={currentType === "list" ? "default" : "secondary"}
                className={`flex-1 ${currentType === "list" ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
                onClick={() => setValue("type", "list")}
              >
                ✓ Checklist
              </Button>
            </div>
          </div>

          {/* Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Item title..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Reminder Due Date */}
          {currentType === "reminder" && (
            <FormField
              control={form.control}
              name="dueDateString"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date & Time</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Checklist items */}
          {currentType === "list" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Checklist Items
              </label>
              <div className="space-y-2">
                {currentChecklist.map((ci) => (
                  <div key={ci.id} className="flex items-center gap-2">
                    <Input
                      value={ci.text}
                      onChange={(e) =>
                        handleUpdateChecklistItem(ci.id, e.target.value)
                      }
                      className="flex-1 h-8"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(ci.id)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Add an item..."
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddChecklistItem();
                      }
                    }}
                    className="flex-1 h-8"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddChecklistItem}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {currentType !== "list" && (
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details / Content</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-600"
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="#tag"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-7 w-20 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2 text-xs text-zinc-800 focus:border-indigo-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Update Item"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Dialog>
  );
}
