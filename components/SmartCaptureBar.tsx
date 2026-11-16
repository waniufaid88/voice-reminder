"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { WaveformVisualizer } from "./WaveformVisualizer";
import { ItemPreviewDialog, StructuredItemData } from "./ItemPreviewDialog";
import { Button } from "@/components/ui/button";

import {
  parseNaturalReminder,
  parseMultipleReminders,
  cleanReminderContent,
  generateSmartListInfo,
  generateSmartNoteInfo,
} from "@/lib/natural-date-parser";

const captureSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Please type a note, reminder, or task")
    .max(1000, "Text cannot exceed 1000 characters"),
});

type CaptureFormValues = z.infer<typeof captureSchema>;

interface SmartCaptureBarProps {
  onSaveItem: (data: StructuredItemData | StructuredItemData[]) => Promise<void>;
}

/**
 * Detects actual checklist/shopping intent.
 *
 * Important:
 * A comma or the word "and" alone does NOT mean a checklist.
 */
function isExplicitListRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  const explicitListPatterns = [
    /\b(?:make|create|prepare|write|show)\s+(?:me\s+)?(?:a\s+)?(?:shopping\s+|grocery\s+|to[- ]?do\s+)?list\b/i,
    /\b(?:shopping|grocery|check|to[- ]?do)\s+list\b/i,
    /\bchecklist\b/i,
    /\badd\s+.+\s+to\s+(?:my|the)\s+list\b/i,
    /\bput\s+.+\s+on\s+(?:my|the)\s+list\b/i,
  ];

  if (explicitListPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  // Examples:
  // "I need to buy a laptop and mouse."
  // "I have to purchase milk and eggs."
  // "I want to get a new keyboard."
  const buyingIntentPattern =
    /\b(?:need|have|want|would like|should|must)\s+to\s+(?:buy|purchase|get|pick up)\b/i;

  if (buyingIntentPattern.test(normalized)) {
    return true;
  }

  // Direct shopping commands:
  // "Buy milk and eggs."
  // "Purchase a laptop."
  // "Pick up bread and butter."
  const directBuyingPattern =
    /^\s*(?:please\s+)?(?:buy|purchase|pick up|get)\s+.+/i;

  if (directBuyingPattern.test(normalized)) {
    return true;
  }

  return false;
}

export function SmartCaptureBar({ onSaveItem }: SmartCaptureBarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [previewData, setPreviewData] =
    useState<StructuredItemData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
  } = useForm<CaptureFormValues>({
    resolver: zodResolver(captureSchema),
    defaultValues: {
      text: "",
    },
  });

  const typedText = watch("text");

  const {
    isRecording,
    isPaused,
    formattedTime,
    error: recorderError,
    analyser,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  // Listen for global custom event to trigger recording from mobile bottom nav or shortcuts
  useEffect(() => {
    const handleTriggerRecording = () => {
      if (!isRecording && !isProcessing) {
        startRecording();
      }
    };
    window.addEventListener("start-voice-recording", handleTriggerRecording);
    return () => {
      window.removeEventListener("start-voice-recording", handleTriggerRecording);
    };
  }, [isRecording, isProcessing, startRecording]);

  /**
   * Creates a preview using local parsing when the API fails.
   */
  const createFallbackPreview = (
    text: string,
    audioData?: {
      audioBlob: Blob;
      audioDuration: number;
      audioPreviewUrl?: string;
    }
  ): StructuredItemData => {
    const offset = new Date().getTimezoneOffset();

    // Check for multiple distinct reminders first unless explicit list intent
    if (!isExplicitListRequest(text)) {
      const multi = parseMultipleReminders(text, new Date(), offset);
      if (multi && multi.length > 1) {
        const items: StructuredItemData[] = multi.map((m) => {
          const isDaily = m.recurrenceMode === "daily";
          return {
            type: "reminder",
            title: m.title || "Reminder",
            content: cleanReminderContent(
              m.title + (m.dueDateLocal ? ` scheduled for ${m.dueDateLocal}` : "")
            ),
            dueDate: m.dueDate,
            dueDateLocal: m.dueDateLocal,
            recurrenceMode: m.recurrenceMode || "once",
            recurrenceDays: m.recurrenceDays,
            isDaily,
            ...(audioData || {}),
            tags: audioData
              ? ["#reminder", "#voice"]
              : ["#reminder", isDaily ? "#daily" : "#task"],
          };
        });

        return {
          type: "reminder",
          title: items[0].title,
          content: cleanReminderContent(text),
          dueDate: items[0].dueDate,
          dueDateLocal: items[0].dueDateLocal,
          recurrenceMode: items[0].recurrenceMode,
          recurrenceDays: items[0].recurrenceDays,
          isDaily: items[0].isDaily,
          ...(audioData || {}),
          tags: audioData ? ["#reminder", "#voice"] : ["#reminder"],
          items,
        };
      }
    }

    const natural = parseNaturalReminder(
      text,
      new Date(),
      offset
    );

    // Reminder intent takes priority.
    if (natural.isReminder) {
      return {
        type: "reminder",
        title: natural.title,
        content:
          cleanReminderContent(text) ||
          (audioData
            ? `Voice Reminder (${audioData.audioDuration}s)`
            : text),
        dueDate: natural.dueDate,
        dueDateLocal: natural.dueDateLocal,
        recurrenceMode: natural.recurrenceMode || "once",
        recurrenceDays: natural.recurrenceDays,
        isDaily: natural.recurrenceMode === "daily",
        ...(audioData || {}),
        tags: audioData
          ? ["#reminder", "#voice"]
          : ["#reminder"],
      };
    }

    // Only explicit shopping/checklist intent creates a list.
    if (isExplicitListRequest(text)) {
      const listInfo = generateSmartListInfo(text);

      return {
        type: "list",
        title: listInfo.title,
        content: listInfo.content,
        checklist: listInfo.checklist,
        ...(audioData || {}),
        tags: audioData
          ? ["#list", "#voice"]
          : ["#list"],
      };
    }

    // Everything else remains a note.
    const noteInfo = generateSmartNoteInfo(text);

    return {
      type: "note",
      title: noteInfo.title,
      content: noteInfo.content,
      ...(audioData || {}),
      tags: audioData
        ? ["#note", "#voice"]
        : ["#note"],
    };
  };

  /**
   * Corrects an API response when it misses clear shopping intent.
   * Preserves multiple reminders if returned by API.
   *
   * We do not override an API Reminder.
   */
  const correctApiClassification = (
    data: StructuredItemData,
    text: string,
    audioData?: {
      audioBlob: Blob;
      audioDuration: number;
      audioPreviewUrl?: string;
    }
  ): StructuredItemData => {
    // If multiple reminders were parsed, keep them and attach audio
    if (data.items && data.items.length > 1) {
      const itemsWithAudio = data.items.map((it) => ({
        ...it,
        ...(audioData || {}),
      }));
      return {
        ...data,
        ...(audioData || {}),
        items: itemsWithAudio,
      };
    }

    if (
      data.type === "reminder" ||
      data.type === "list" ||
      !isExplicitListRequest(text)
    ) {
      return {
        ...data,
        ...(audioData || {}),
      };
    }

    const listInfo = generateSmartListInfo(text);

    return {
      ...data,
      type: "list",
      title: listInfo.title,
      content: listInfo.content,
      checklist: listInfo.checklist,
      ...(audioData || {}),
      tags: audioData
        ? ["#list", "#voice"]
        : data.tags?.length
          ? data.tags
          : ["#list"],
    };
  };

  // Handle manual text submission
  const handleTextSubmit = async (values: CaptureFormValues) => {
    if (isProcessing) return;

    setIsProcessing(true);
    setProcessingStatus("Structuring text...");

    try {
      const clientTimezoneOffset = new Date().getTimezoneOffset();
      const clientTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      const clientNowISO = new Date().toISOString();
      const clientNowLocal = new Date().toString();

      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: values.text,
          clientTimezone,
          clientTimezoneOffset,
          clientNowISO,
          clientNowLocal,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPreviewData(createFallbackPreview(values.text));
      } else {
        setPreviewData(
          correctApiClassification(data, values.text)
        );
      }

      setIsPreviewOpen(true);
      reset();
    } catch {
      setPreviewData(createFallbackPreview(values.text));
      setIsPreviewOpen(true);
      reset();
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleTextError = () => {
    toast.error(
      "Please enter some text or click the microphone to record"
    );
  };

  // Handle Stop Recording & Transcribe
  const handleStopAndProcess = async () => {
    setIsProcessing(true);
    setProcessingStatus(
      "Transcribing audio & structuring with AI..."
    );

    const result = await stopRecording();

    if (!result || result.blob.size === 0) {
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    // Audio size and duration validations
    if (result.duration < 1) {
      setIsProcessing(false);
      setProcessingStatus("");
      toast.error(
        "Recording is too short (minimum 1 second). Please speak clearly."
      );
      return;
    }

    if (result.blob.size > 15 * 1024 * 1024) {
      setIsProcessing(false);
      setProcessingStatus("");
      toast.error("Audio recording exceeds 15MB size limit.");
      return;
    }

    try {
      const formData = new FormData();

      const rawMime = (result.blob.type || "").toLowerCase();

      let filename = "voice-recording.webm";
      let cleanType = "audio/webm";

      if (rawMime.includes("mp4") || rawMime.includes("m4a")) {
        filename = "voice-recording.mp4";
        cleanType = "audio/mp4";
      } else if (rawMime.includes("ogg")) {
        filename = "voice-recording.ogg";
        cleanType = "audio/ogg";
      } else if (rawMime.includes("wav")) {
        filename = "voice-recording.wav";
        cleanType = "audio/wav";
      }

      // Remove codec parameters for backend and Whisper compatibility.
      const sanitizedBlob = new Blob([result.blob], {
        type: cleanType,
      });

      formData.append("audio", sanitizedBlob, filename);

      formData.append(
        "fallbackText",
        (result.browserTranscript || "").trim()
      );

      formData.append(
        "clientTimezone",
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );

      formData.append(
        "clientTimezoneOffset",
        new Date().getTimezoneOffset().toString()
      );

      formData.append(
        "clientNowISO",
        new Date().toISOString()
      );

      formData.append(
        "clientNowLocal",
        new Date().toString()
      );

      const res = await fetch("/api/ai/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const text = (result.browserTranscript || "").trim();

        if (!text) {
          setIsProcessing(false);
          setProcessingStatus("");

          toast.error(
            data?.error ||
            "Could not transcribe audio. Please speak clearly and try again.",
            { duration: 6000 }
          );

          return;
        }

        toast("Transcribed using local speech recognition", {
          icon: "🎙️",
        });

        setPreviewData(
          createFallbackPreview(text, {
            audioBlob: sanitizedBlob,
            audioDuration: result.duration,
            audioPreviewUrl: result.url,
          })
        );

        setIsPreviewOpen(true);
      } else {
        if (data.isQuotaExhausted) {
          toast(
            "Transcribed via speech recognition (OpenAI account has 0 credits remaining).",
            {
              icon: "🎙️",
              duration: 6000,
            }
          );
        } else {
          toast.success("Transcribed & structured with AI! ✨");
        }

        const text = (result.browserTranscript || "").trim();

        // Use the API classification unless it misses explicit
        // shopping/checklist intent.
        let finalPreview: StructuredItemData = {
          ...data,
          audioBlob: sanitizedBlob,
          audioDuration: result.duration,
          audioPreviewUrl: result.url,
        };

        if (data.items && data.items.length > 1) {
          finalPreview.items = data.items.map((it: StructuredItemData) => ({
            ...it,
            audioBlob: sanitizedBlob,
            audioDuration: result.duration,
            audioPreviewUrl: result.url,
          }));
        }

        if (text) {
          finalPreview = correctApiClassification(
            finalPreview,
            text,
            {
              audioBlob: sanitizedBlob,
              audioDuration: result.duration,
              audioPreviewUrl: result.url,
            }
          );
        }

        setPreviewData(finalPreview);
        setIsPreviewOpen(true);
      }
    } catch {
      const text = (result.browserTranscript || "").trim();

      if (!text) {
        toast.error(
          "Could not transcribe audio. Please speak clearly and try again."
        );
        return;
      }

      setPreviewData(
        createFallbackPreview(text, {
          audioBlob: result.blob,
          audioDuration: result.duration,
          audioPreviewUrl: result.url,
        })
      );

      setIsPreviewOpen(true);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    toast("Recording discarded", {
      icon: "🗑️",
    });
  };

  return (
    <>
      <div className="w-full">
        {/* Error notification if mic permissions failed */}
        {recorderError && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {recorderError}
          </div>
        )}

        {/* Processing Spinner Notification */}
        {isProcessing && (
          <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs font-medium text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300 animate-pulse">
            <svg
              className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>

            {processingStatus}
          </div>
        )}

        {/* Recording Active Tray */}
        {isRecording ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border-2 border-indigo-500/50 bg-white p-3 sm:p-3.5 shadow-lg shadow-indigo-500/10 dark:border-indigo-500/30 dark:bg-zinc-900">
            <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3 sm:h-3.5 sm:w-3.5">
                  {!isPaused && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  )}

                  <span
                    className={`relative inline-flex h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-rose-500"
                      }`}
                  />
                </span>

                <span className="font-mono text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {formattedTime}
                </span>

                <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {isPaused ? "Paused" : "Recording..."}
                </span>
              </div>

              {/* Cancel on mobile top-right */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="sm:hidden rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                title="Discard recording"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Live Waveform Visualizer */}
            <div className="w-full sm:flex-1 sm:max-w-xs flex justify-center py-0.5 sm:py-0">
              <WaveformVisualizer
                analyser={analyser}
                isPaused={isPaused}
              />
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
              {isPaused ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1 sm:flex-none h-9 text-xs"
                  onClick={resumeRecording}
                >
                  ▶ Resume
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1 sm:flex-none h-9 text-xs"
                  onClick={pauseRecording}
                >
                  ⏸ Pause
                </Button>
              )}

              {/* Stop & Transcribe */}
              <Button
                type="button"
                size="sm"
                onClick={handleStopAndProcess}
                disabled={isProcessing}
                className="flex-1 sm:flex-none h-9 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                <span>⏹</span> Done
              </Button>

              {/* Cancel desktop */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="hidden sm:block rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                title="Discard recording"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Capture Input Bar */
          <form
            onSubmit={handleSubmit(
              handleTextSubmit,
              handleTextError
            )}
            className="flex items-center gap-1.5 sm:gap-2.5 rounded-2xl border border-zinc-200/90 bg-white p-2 sm:p-2.5 shadow-sm transition-all focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-600/15 dark:border-white/[0.08] dark:bg-[#151624]"
          >
            <input
              type="text"
              id="capture-thought-input"
              {...register("text")}
              disabled={isProcessing}
              placeholder="Type a note, reminder, or task..."
              className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-500 min-w-0"
            />

            {/* Save Button */}
            <Button
              type="submit"
              disabled={isProcessing || !typedText?.trim()}
              size="sm"
              className="h-10 px-4 sm:px-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-purple-600/25 shrink-0 flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
              title="Save typed text"
            >
              <span>Save</span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </Button>

            {/* Mic Record Button */}
            <button
              type="button"
              onClick={startRecording}
              disabled={isProcessing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-[#232438] dark:text-zinc-200 dark:hover:bg-[#2d2f49] transition-transform active:scale-95 focus:outline-none cursor-pointer"
              title="Record voice note"
              aria-label="Record voice note"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                />
              </svg>
            </button>
          </form>
        )}
      </div>

      {/* Editable Preview Modal */}
      <ItemPreviewDialog
        isOpen={isPreviewOpen}
        itemData={previewData}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewData(null);
        }}
        onSave={async (finalData) => {
          await onSaveItem(finalData);
          setIsPreviewOpen(false);
          setPreviewData(null);
        }}
      />
    </>
  );
}
