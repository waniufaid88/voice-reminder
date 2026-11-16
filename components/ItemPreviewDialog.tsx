"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";

import { AudioPlayer } from "./AudioPlayer";
import { RecurrenceSelector } from "./RecurrenceSelector";
import { DateTimePicker12h } from "./DateTimePicker12h";
import {
  formatLocalDatetime,
  parseLocalDatetime,
  formatAudioDuration,
} from "@/lib/date-utils";
import { parseNaturalReminder, cleanReminderTitle } from "@/lib/natural-date-parser";
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
  checklist?: Array<{
    id: string;
    text: string;
    completed: boolean;
  }>;
  tags?: string[];
  audioBlob?: Blob;
  audioDuration?: number;
  audioPreviewUrl?: string;
  rawTranscript?: string;
  isQuotaExhausted?: boolean;
  items?: StructuredItemData[];
}

interface ItemPreviewDialogProps {
  isOpen: boolean;
  itemData: StructuredItemData | null;
  onClose: () => void;
  onSave: (finalData: StructuredItemData | StructuredItemData[]) => Promise<void>;
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

  // Multi-reminder batch state
  const [multiReminders, setMultiReminders] = useState<StructuredItemData[]>([]);
  const isMultiReminderMode = multiReminders.length > 1;

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

  const {
    watch,
    getValues,
    setValue,
    reset,
    handleSubmit,
  } = form;

  const currentType = watch("type");
  const currentTags = watch("tags") || [];
  const currentChecklist = watch("checklist") || [];

  const currentRecurrenceMode =
    (watch("recurrenceMode") as "once" | "daily" | "custom") ||
    "once";

  const currentRecurrenceDays =
    watch("recurrenceDays") || [new Date().getDay()];

  // Initialize form or multi-reminders state when itemData changes
  useEffect(() => {
    if (!itemData) {
      setMultiReminders([]);
      return;
    }

    // If multiple reminders were detected
    if (itemData.items && itemData.items.length > 1) {
      setMultiReminders(
        itemData.items.map((it) => {
          let dueDateLocal = it.dueDateLocal;
          if (!dueDateLocal && it.dueDate) {
            dueDateLocal = formatLocalDatetime(it.dueDate);
          }
          return {
            ...it,
            dueDateLocal: dueDateLocal || "",
          };
        })
      );
      return;
    }

    setMultiReminders([]);

    const cleanContent =
      itemData.content &&
        !itemData.content.includes("Whisper API failed")
        ? itemData.content
        : itemData.rawTranscript || "";

    const itemType: "note" | "reminder" | "list" =
      itemData.type || "note";

    let calculatedDueDate = itemData.dueDate;

    let calculatedMode =
      itemData.recurrenceMode ||
      (itemData.isDaily ? "daily" : "once");

    let calculatedDays = itemData.recurrenceDays;

    if (itemType === "reminder" && !calculatedDueDate) {
      const offset = new Date().getTimezoneOffset();

      const natural = parseNaturalReminder(
        cleanContent || itemData.title || "",
        new Date(),
        offset
      );

      if (natural.dueDate) {
        calculatedDueDate = natural.dueDate;

        if (natural.recurrenceMode) {
          calculatedMode = natural.recurrenceMode;
        }

        if (natural.recurrenceDays) {
          calculatedDays = natural.recurrenceDays;
        }
      }
    }

    let defaultDueDateStr = "";

    if (itemType === "reminder") {
      if (itemData.dueDateLocal) {
        defaultDueDateStr = itemData.dueDateLocal;
      } else if (calculatedDueDate) {
        defaultDueDateStr = formatLocalDatetime(calculatedDueDate);
      }
    }

    const initialTags =
      itemData.tags && itemData.tags.length > 0
        ? itemData.tags
        : itemData.audioBlob
          ? ["#voice"]
          : [];

    reset({
      type: itemType,
      title: itemData.title || "",
      content: cleanContent,
      dueDateString: defaultDueDateStr,
      isDaily: calculatedMode === "daily",
      recurrenceMode: calculatedMode,
      recurrenceDays:
        calculatedDays || [new Date().getDay()],
      checklist: itemData.checklist || [],
      tags: initialTags,
    });
  }, [itemData, reset]);

  // Handlers for Multi-Reminder Mode
  const updateReminderTitle = (index: number, title: string) => {
    setMultiReminders((prev) =>
      prev.map((r, i) => (i === index ? { ...r, title } : r))
    );
  };

  const updateReminderDueDate = (index: number, dueDateLocal: string) => {
    const offset = new Date().getTimezoneOffset();
    const dueDate = parseLocalDatetime(dueDateLocal, offset);
    setMultiReminders((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, dueDateLocal, dueDate } : r
      )
    );
  };

  const updateReminderContent = (index: number, content: string) => {
    setMultiReminders((prev) =>
      prev.map((r, i) => (i === index ? { ...r, content } : r))
    );
  };

  const updateReminderRecurrence = (
    index: number,
    recurrenceMode: "once" | "daily" | "custom"
  ) => {
    setMultiReminders((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
            ...r,
            recurrenceMode,
            isDaily: recurrenceMode === "daily",
          }
          : r
      )
    );
  };

  const handleRemoveReminder = (index: number) => {
    const remaining = multiReminders.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      onClose();
      return;
    }
    setMultiReminders(remaining);
  };

  const handleAddAnotherReminder = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    const localStr = formatLocalDatetime(now.getTime());

    setMultiReminders((prev) => [
      ...prev,
      {
        type: "reminder",
        title: `Reminder ${prev.length + 1}`,
        content: "",
        dueDate: now.getTime(),
        dueDateLocal: localStr,
        recurrenceMode: "once",
        isDaily: false,
        tags: ["#reminder", "#task"],
        audioBlob: itemData?.audioBlob,
        audioDuration: itemData?.audioDuration,
        audioPreviewUrl: itemData?.audioPreviewUrl,
      },
    ]);
  };

  const handleSaveAllMultiReminders = async () => {
    // Validate each reminder has title and date
    for (let i = 0; i < multiReminders.length; i++) {
      const rem = multiReminders[i];
      if (!rem.title.trim()) {
        toast.error(`Reminder ${i + 1} needs a title`);
        return;
      }
      if (!rem.dueDateLocal) {
        toast.error(`Reminder ${i + 1} ("${rem.title}") needs a scheduled time`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSave(multiReminders);
      onClose();
    } catch {
      toast.error("Failed to save reminders");
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers for Single Item Mode
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
      currentTags.filter((tag) => tag !== tagToRemove),
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
      currentChecklist.map((item) =>
        item.id === id ? { ...item, text } : item
      ),
      { shouldValidate: true }
    );
  };

  const handleSelectReminder = () => {
    setValue("type", "reminder", { shouldValidate: true });

    if (!getValues("dueDateString")) {
      const natural = parseNaturalReminder(
        getValues("content") || getValues("title") || "",
        new Date()
      );

      if (natural.dueDate) {
        setValue(
          "dueDateString",
          formatLocalDatetime(natural.dueDate),
          { shouldValidate: true }
        );

        if (natural.recurrenceMode) {
          setValue("recurrenceMode", natural.recurrenceMode, { shouldValidate: true });
          setValue("isDaily", natural.recurrenceMode === "daily", { shouldValidate: true });
        }

        if (natural.recurrenceDays) {
          setValue("recurrenceDays", natural.recurrenceDays, { shouldValidate: true });
        }
      }
    }
  };

  const onSubmit = async (values: ItemFormValues) => {
    setIsSaving(true);

    try {
      let finalDueDate: number | null = null;

      if (values.type === "reminder" && values.dueDateString) {
        const offset = new Date().getTimezoneOffset();
        const parsedDate = parseLocalDatetime(values.dueDateString, offset);
        finalDueDate = parsedDate ?? null;
      }

      await onSave({
        ...itemData,
        type: values.type,
        title: values.title.trim(),
        content: values.content.trim(),
        dueDate: finalDueDate ?? null,
        dueDateLocal: values.dueDateString,
        isDaily:
          values.type === "reminder"
            ? values.recurrenceMode === "daily" || values.isDaily
            : undefined,
        recurrenceMode:
          values.type === "reminder"
            ? values.recurrenceMode || "once"
            : undefined,
        recurrenceDays:
          values.type === "reminder" && values.recurrenceMode === "custom"
            ? values.recurrenceDays
            : undefined,
        checklist: values.type === "list" ? values.checklist : undefined,
        tags: values.tags,
      });

      onClose();
    } catch {
      toast.error("Failed to save item.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* ---------------------------------------------------- */}
      {/* MULTI-REMINDER BATCH REVIEW VIEW                     */}
      {/* ---------------------------------------------------- */}
      {isMultiReminderMode ? (
        <div className="space-y-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold">
                  Review Reminders
                </DialogTitle>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
                  {multiReminders.length} detected
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Multiple tasks detected from your input. Review, edit, or remove any before saving.
            </p>
          </DialogHeader>

          {/* Voice recording audio playback if available */}
          {itemData?.audioPreviewUrl && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <AudioPlayer
                src={itemData.audioPreviewUrl}
                initialDuration={itemData.audioDuration}
              />
            </div>
          )}

          {/* Scrollable list of detected reminder cards */}
          <div className="max-h-[60vh] space-y-3.5 overflow-y-auto pr-1">
            {multiReminders.map((rem, idx) => (
              <div
                key={idx}
                className="relative rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/80 space-y-3"
              >
                {/* Header row with reminder index and remove button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Reminder {idx + 1}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveReminder(idx)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                    title="Remove reminder"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Remove</span>
                  </button>
                </div>

                {/* Reminder Title */}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Title *
                  </label>
                  <Input
                    value={rem.title}
                    onChange={(e) => updateReminderTitle(idx, e.target.value)}
                    placeholder="e.g. Call my friend"
                    className="h-8 text-xs font-semibold"
                  />
                </div>

                {/* Due Date & Time Picker */}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Scheduled Time *
                  </label>
                  <DateTimePicker12h
                    value={rem.dueDateLocal || ""}
                    onChange={(val) => updateReminderDueDate(idx, val)}
                  />
                </div>

                {/* Task Details / Description */}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                    Task Details (optional)
                  </label>
                  <Input
                    value={rem.content}
                    onChange={(e) => updateReminderContent(idx, e.target.value)}
                    placeholder="e.g. Discuss assignment with team"
                    className="h-8 text-xs text-zinc-600 dark:text-zinc-400"
                  />
                </div>

                {/* Recurrence Mode Selector */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] font-semibold text-zinc-500">Repeat:</span>
                  <div className="flex gap-1.5">
                    {(["once", "daily"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateReminderRecurrence(idx, mode)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${(rem.recurrenceMode || "once") === mode
                          ? "bg-indigo-600 text-white shadow-2xs font-semibold"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                      >
                        {mode === "once" ? "Once" : "Daily 🔁"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Add another reminder card button */}
            <button
              type="button"
              onClick={handleAddAnotherReminder}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-semibold text-zinc-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors"
            >
              <span>+</span> Add another reminder
            </button>
          </div>

          {/* Batch Save Footer */}
          <DialogFooter className="mt-4 flex sm:justify-between items-center gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSaveAllMultiReminders}
              disabled={isSaving || multiReminders.length === 0}
              className="bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
            >
              {isSaving ? (
                <div className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Saving...</span>
                </div>
              ) : (
                <span>✓ Save All Reminders ({multiReminders.length})</span>
              )}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        /* ---------------------------------------------------- */
        /* SINGLE ITEM PREVIEW VIEW (Note / Reminder / List)    */
        /* ---------------------------------------------------- */
        <>
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
                    onClick={handleSelectReminder}
                  >
                    ⏰ Reminder
                  </Button>

                  <Button
                    type="button"
                    variant={currentType === "list" ? "default" : "secondary"}
                    className={`flex-1 ${currentType === "list" ? "bg-emerald-600 text-white" : ""}`}
                    onClick={() => setValue("type", "list", { shouldValidate: true })}
                  >
                    ☑️ List
                  </Button>
                </div>
              </div>

              {/* Audio preview player */}
              {itemData?.audioPreviewUrl && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <AudioPlayer
                    src={itemData.audioPreviewUrl}
                    initialDuration={itemData.audioDuration}
                  />
                </div>
              )}

              {/* Title input */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Give your thought a short title..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Due Date & Time (Reminders only) */}
              {currentType === "reminder" && (
                <FormField
                  control={form.control}
                  name="dueDateString"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date & Time</FormLabel>
                      <FormControl>
                        <DateTimePicker12h
                          value={field.value || ""}
                          onChange={(val) => field.onChange(val)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Recurrence Selector (Reminders only) */}
              {currentType === "reminder" && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Repeat
                  </label>
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

              {/* Content / Notes field */}
              {currentType !== "list" && (
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {currentType === "reminder" ? "Details (optional)" : "Content"}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Your complete captured text..."
                          className="min-h-[100px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Checklist editor (Lists only) */}
              {currentType === "list" && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Checklist Items
                  </label>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {currentChecklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow-2xs dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <span className="text-zinc-400">☑</span>
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) =>
                            handleUpdateChecklistItem(item.id, e.target.value)
                          }
                          className="flex-1 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveChecklistItem(item.id)}
                          className="text-zinc-400 hover:text-rose-500"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
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
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddChecklistItem}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Tags Section */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Tags
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-zinc-400 hover:text-rose-500"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
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

              {/* Single item save footer */}
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
        </>
      )}
    </Dialog>
  );
}
