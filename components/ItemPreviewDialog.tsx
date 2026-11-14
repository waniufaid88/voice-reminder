"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";

import { AudioPlayer } from "./AudioPlayer";
import { RecurrenceSelector } from "./RecurrenceSelector";
import { DateTimePicker12h } from "./DateTimePicker12h";
import { formatLocalDatetime, parseLocalDatetime, formatAudioDuration } from "@/lib/date-utils";
import { parseNaturalReminder, generateSmartListInfo } from "@/lib/natural-date-parser";
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

export interface StructuredItemData {
  type: "note" | "reminder" | "list";
  title: string;
  content: string;
  dueDate?: number | null;
  dueDateLocal?: string;
  isDaily?: boolean;
  recurrenceMode?: "once" | "daily" | "custom";
  recurrenceDays?: number[];
  checklist?: Array<{ id: string; text: string; completed: boolean }>;
  tags?: string[];
  audioBlob?: Blob;
  audioDuration?: number;
  audioPreviewUrl?: string;
  rawTranscript?: string;
  isQuotaExhausted?: boolean;
}

interface ItemPreviewDialogProps {
  isOpen: boolean;
  itemData: StructuredItemData | null;
  onClose: () => void;
  onSave: (finalData: StructuredItemData) => Promise<void>;
}

export function ItemPreviewDialog({
  isOpen,
  itemData,
  onClose,
  onSave,
}: ItemPreviewDialogProps) {
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
      isDaily: false,
      recurrenceMode: "once",
      recurrenceDays: [new Date().getDay()],
      checklist: [],
      tags: ["#voice"],
    },
  });

  const { watch, getValues, setValue, reset, handleSubmit } = form;
  const currentType = watch("type");
  const currentTags = watch("tags") || [];
  const currentChecklist = watch("checklist") || [];
  const currentRecurrenceMode = (watch("recurrenceMode") as "once" | "daily" | "custom") || "once";
  const currentRecurrenceDays = watch("recurrenceDays") || [new Date().getDay()];

  useEffect(() => {
    if (itemData) {
      const cleanContent =
        itemData.content && !itemData.content.includes("Whisper API failed")
          ? itemData.content
          : itemData.rawTranscript || "";

      let calculatedDueDate = itemData.dueDate;
      let calculatedMode =
        itemData.recurrenceMode || (itemData.isDaily ? "daily" : "once");
      let calculatedDays = itemData.recurrenceDays;

      // If due date was not set, parse natural language from text or transcript with client timezone offset
      if (!calculatedDueDate) {
        const offset = new Date().getTimezoneOffset();
        const natural = parseNaturalReminder(
          cleanContent || itemData.title || "",
          new Date(),
          offset
        );
        if (natural.dueDate) {
          calculatedDueDate = natural.dueDate;
          if (natural.recurrenceMode) calculatedMode = natural.recurrenceMode;
          if (natural.recurrenceDays) calculatedDays = natural.recurrenceDays;
        }
      }

      // Automatically route to the exact category in the dialog:
      // 1. If checklist items exist (or text describes a list) -> strictly "list"
      // 2. If reminder due date/time is present -> strictly "reminder"
      // 3. Otherwise -> "note"
      let finalChecklist = itemData.checklist || [];
      let itemType: "note" | "reminder" | "list" = itemData.type || "note";

      if (
        finalChecklist.length === 0 &&
        (itemData.type === "list" ||
          cleanContent.toLowerCase().includes("buy ") ||
          cleanContent.toLowerCase().includes("list") ||
          cleanContent.includes(","))
      ) {
        const listInfo = generateSmartListInfo(cleanContent);
        if (listInfo.checklist && listInfo.checklist.length > 0) {
          finalChecklist = listInfo.checklist;
          itemType = "list";
        }
      }

      if (finalChecklist.length > 0) {
        itemType = "list";
      } else if (calculatedDueDate || itemData.dueDateLocal || itemData.dueDate) {
        itemType = "reminder";
      }

      reset({
        type: itemType,
        title: itemData.title || "Untitled",
        content: cleanContent,
        dueDateString:
          itemData.dueDateLocal || formatLocalDatetime(calculatedDueDate),
        isDaily: calculatedMode === "daily",
        recurrenceMode: calculatedMode,
        recurrenceDays: calculatedDays || [new Date().getDay()],
        checklist: finalChecklist,
        tags: itemData.tags || ["#voice"],
      });
      setValue("type", itemType, { shouldValidate: true });
    }
  }, [itemData, reset, setValue]);

  if (!isOpen || !itemData) return null;

  const handleAddTag = () => {
    let tag = newTagInput.trim();
    if (!tag) return;
    if (!tag.startsWith("#")) tag = "#" + tag;
    if (!currentTags.includes(tag)) {
      setValue("tags", [...currentTags, tag], { shouldValidate: true });
    }
    setNewTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setValue(
      "tags",
      currentTags.filter((t) => t !== tagToRemove),
      { shouldValidate: true }
    );
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setValue(
      "checklist",
      [
        ...currentChecklist,
        {
          id: Date.now().toString(),
          text: newChecklistText.trim(),
          completed: false,
        },
      ],
      { shouldValidate: true }
    );
    setNewChecklistText("");
  };

  const handleRemoveChecklistItem = (id: string) => {
    setValue(
      "checklist",
      currentChecklist.filter((item) => item.id !== id),
      { shouldValidate: true }
    );
  };

  const handleUpdateChecklistItem = (id: string, text: string) => {
    setValue(
      "checklist",
      currentChecklist.map((item) => (item.id === id ? { ...item, text } : item)),
      { shouldValidate: true }
    );
  };

  const onSubmit = async (values: ItemFormValues) => {
    setIsSaving(true);
    try {
      const dueDate =
        values.type === "reminder"
          ? parseLocalDatetime(values.dueDateString)
          : undefined;

      await onSave({
        ...itemData,
        type: values.type,
        title: values.title.trim(),
        content: values.content.trim(),
        dueDate,
        isDaily: values.type === "reminder" ? values.recurrenceMode === "daily" : undefined,
        recurrenceMode: values.type === "reminder" ? (values.recurrenceMode || "once") : undefined,
        recurrenceDays:
          values.type === "reminder" && values.recurrenceMode === "custom"
            ? values.recurrenceDays
            : undefined,
        checklist: values.type === "list" ? values.checklist : undefined,
        tags: values.tags,
      });

      toast.success(
        `Saved as ${values.type.charAt(0).toUpperCase() + values.type.slice(1)}!`
      );
      onClose();
    } catch {
      toast.error("Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle>Preview & Edit</DialogTitle>
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
          onSubmit={handleSubmit(onSubmit)}
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
                onClick={() => setValue("type", "note", { shouldValidate: true })}
              >
                📝 Note
              </Button>
              <Button
                type="button"
                variant={currentType === "reminder" ? "default" : "secondary"}
                className={`flex-1 ${currentType === "reminder" ? "bg-amber-500 text-white hover:bg-amber-600" : ""}`}
                onClick={() => {
                  setValue("type", "reminder", { shouldValidate: true });
                  if (!getValues("dueDateString")) {
                    const natural = parseNaturalReminder(
                      getValues("content") || getValues("title") || "",
                      new Date()
                    );
                    if (natural.dueDate) {
                      setValue("dueDateString", formatLocalDatetime(natural.dueDate), { shouldValidate: true });
                      if (natural.recurrenceMode) {
                        setValue("recurrenceMode", natural.recurrenceMode, { shouldValidate: true });
                        setValue("isDaily", natural.recurrenceMode === "daily", { shouldValidate: true });
                      }
                      if (natural.recurrenceDays) {
                        setValue("recurrenceDays", natural.recurrenceDays, { shouldValidate: true });
                      }
                    } else {
                      const defaultTime = formatLocalDatetime(Date.now() + 2 * 60 * 60 * 1000);
                      setValue("dueDateString", defaultTime, { shouldValidate: true });
                    }
                  }
                }}
              >
                ⏰ Reminder
              </Button>
              <Button
                type="button"
                variant={currentType === "list" ? "default" : "secondary"}
                className={`flex-1 ${currentType === "list" ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
                onClick={() => setValue("type", "list", { shouldValidate: true })}
              >
                ✓ Checklist
              </Button>
            </div>
          </div>

          {/* Title Field with Zod Validation */}
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

          {/* Audio Player if present */}
          {itemData.audioPreviewUrl && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Original Voice Recording
                </label>
                {itemData.audioDuration && itemData.audioDuration > 0 ? (
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-mono font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                    ⏱ {formatAudioDuration(itemData.audioDuration)}
                  </span>
                ) : null}
              </div>
              <AudioPlayer
                src={itemData.audioPreviewUrl}
                initialDuration={itemData.audioDuration}
              />
            </div>
          )}

          {/* Details / Content Field with Zod Validation */}
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Details / Content</FormLabel>
                  <span className="text-[11px] text-zinc-400">
                    {currentType === "list"
                      ? "Optional note for checklist"
                      : "Notes & details"}
                  </span>
                </div>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="Type your notes, thoughts, or transcribed details here..."
                    className="w-full text-xs font-normal leading-relaxed"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Due date picker with Zod validation for Reminders */}
          {currentType === "reminder" && (
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="dueDateString"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date & 12-Hour Time (AM / PM)</FormLabel>
                    <FormControl>
                      <DateTimePicker12h
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Recurrence Frequency (Once, Daily, Custom Days) */}
              <RecurrenceSelector
                mode={currentRecurrenceMode}
                selectedDays={currentRecurrenceDays}
                onChangeMode={(mode) => {
                  setValue("recurrenceMode", mode, { shouldValidate: true });
                  setValue("isDaily", mode === "daily", { shouldValidate: true });
                }}
                onChangeDays={(days) => {
                  setValue("recurrenceDays", days, { shouldValidate: true });
                }}
              />
            </div>
          )}

          {/* Checklist items for Lists */}
          {currentType === "list" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Checklist Items
              </label>
              <div className="space-y-2">
                {currentChecklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      value={item.text}
                      onChange={(e) =>
                        handleUpdateChecklistItem(item.id, e.target.value)
                      }
                      className="flex-1 h-8"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Add checklist item..."
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
                  placeholder="#add-tag"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-7 w-24 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2 text-xs text-zinc-800 focus:border-indigo-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
              {isSaving ? "Saving..." : "Save Item"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Dialog>
  );
}
