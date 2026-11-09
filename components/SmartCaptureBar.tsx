"use client";

import { useState } from "react";
import toast from "react-hot-toast";

import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { WaveformVisualizer } from "./WaveformVisualizer";
import { ItemPreviewDialog, StructuredItemData } from "./ItemPreviewDialog";
import { Button } from "@/components/ui/button";

interface SmartCaptureBarProps {
  onSaveItem: (data: StructuredItemData) => Promise<void>;
}

export function SmartCaptureBar({ onSaveItem }: SmartCaptureBarProps) {
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [previewData, setPreviewData] = useState<StructuredItemData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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

  // Handle manual text submission
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing) return;

    setIsProcessing(true);
    setProcessingStatus("Structuring note with AI...");

    try {
      const res = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPreviewData({
          type: "note",
          title: textInput.slice(0, 30) || "New Note",
          content: textInput,
          tags: ["#note"],
        });
      } else {
        setPreviewData(data);
      }
      setIsPreviewOpen(true);
      setTextInput("");
    } catch {
      setPreviewData({
        type: "note",
        title: textInput.slice(0, 30) || "New Note",
        content: textInput,
        tags: ["#note"],
      });
      setIsPreviewOpen(true);
      setTextInput("");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  // Handle Stop Recording & Transcribe
  const handleStopAndProcess = async () => {
    setIsProcessing(true);
    setProcessingStatus("Transcribing audio & structuring with AI...");

    const result = await stopRecording();
    if (!result || result.blob.size === 0) {
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("audio", result.blob, "voice-note.webm");

      const res = await fetch("/api/ai/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast("Saved audio locally without AI transcription.", { icon: "ℹ️" });
        setPreviewData({
          type: "note",
          title: "Voice Note (" + result.duration + "s)",
          content: data.error || "Audio recording",
          audioBlob: result.blob,
          audioDuration: result.duration,
          audioPreviewUrl: result.url,
          tags: ["#voice"],
        });
      } else {
        toast.success("Transcribed & structured with AI! ✨");
        setPreviewData({
          ...data,
          audioBlob: result.blob,
          audioDuration: result.duration,
          audioPreviewUrl: result.url,
        });
      }
      setIsPreviewOpen(true);
    } catch {
      setPreviewData({
        type: "note",
        title: "Voice Recording",
        content: "Recorded voice note.",
        audioBlob: result.blob,
        audioDuration: result.duration,
        audioPreviewUrl: result.url,
        tags: ["#voice"],
      });
      setIsPreviewOpen(true);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
    toast("Recording discarded", { icon: "🗑️" });
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
            <svg className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {processingStatus}
          </div>
        )}

        {/* Recording Active Tray */}
        {isRecording ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-indigo-500/50 bg-white p-3.5 shadow-lg shadow-indigo-500/10 dark:border-indigo-500/30 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                {!isPaused && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-3.5 w-3.5 rounded-full ${
                    isPaused ? "bg-amber-500" : "bg-rose-500"
                  }`}
                />
              </span>
              <span className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {formattedTime}
              </span>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {isPaused ? "Paused" : "Recording..."}
              </span>
            </div>

            {/* Live Waveform Visualizer */}
            <div className="flex-1 max-w-xs flex justify-center">
              <WaveformVisualizer analyser={analyser} isPaused={isPaused} />
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-2">
              {/* Pause / Resume */}
              {isPaused ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={resumeRecording}
                >
                  ▶ Resume
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
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
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                <span>⏹</span> Done
              </Button>

              {/* Cancel */}
              <button
                type="button"
                onClick={handleCancelRecording}
                className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                title="Discard recording"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* Normal Capture Input Bar */
          <form
            onSubmit={handleTextSubmit}
            className="flex items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-sm transition-all focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-600/15 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={isProcessing}
              placeholder="Type a note, reminder, or task... (or click the microphone)"
              className="flex-1 bg-transparent px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
            />

            {/* Mic Record Button */}
            <button
              type="button"
              onClick={startRecording}
              disabled={isProcessing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-transform hover:scale-105 hover:bg-indigo-500 focus:outline-none"
              title="Record voice note"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
