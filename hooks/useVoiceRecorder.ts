"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface BrowserSpeechEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export interface RecordingResult {
  blob: Blob;
  duration: number;
  url: string;
  browserTranscript: string;
}

/**
 * Intelligent transcript merger that eliminates duplication across SpeechRecognition
 * restarts and interim/final transitions, especially on Android Chrome.
 */
function mergeTranscripts(existing: string, incoming: string): string {
  const ext = existing.trim();
  const inc = incoming.trim();
  if (!ext) return inc;
  if (!inc) return ext;

  // Exact match or one completely encompasses the other
  if (ext.toLowerCase() === inc.toLowerCase()) return ext;
  if (ext.toLowerCase().endsWith(inc.toLowerCase())) return ext;
  if (inc.toLowerCase().startsWith(ext.toLowerCase())) return inc;

  const extWords = ext.split(/\s+/);
  const incWords = inc.split(/\s+/);
  const maxOverlap = Math.min(extWords.length, incWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    const extSuffix = extWords
      .slice(extWords.length - overlap)
      .join(" ")
      .toLowerCase();
    const incPrefix = incWords
      .slice(0, overlap)
      .join(" ")
      .toLowerCase();

    if (extSuffix === incPrefix) {
      return `${ext} ${incWords.slice(overlap).join(" ")}`.trim();
    }
  }

  return `${ext} ${inc}`.trim();
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const isRecordingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const accumulatedFinalTranscriptRef = useRef<string>("");
  const speechTranscriptRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const elapsedTimeRef = useRef<number>(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      isRecordingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      analyserRef.current = null;
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.onerror = null;
          speechRecognitionRef.current.onresult = null;
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    audioChunksRef.current = [];
    setDuration(0);
    setLiveTranscript("");
    accumulatedFinalTranscriptRef.current = "";
    speechTranscriptRef.current = "";
    startTimeRef.current = Date.now();
    elapsedTimeRef.current = 0;
    isStoppingRef.current = false;
    isRecordingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Setup Web Audio API Analyser for live waveform visualization
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      source.connect(analyserNode);
      analyserRef.current = analyserNode;
      setAnalyser(analyserNode);

      // Setup in-browser Web Speech API transcription (Chrome Android, Chrome Desktop, Safari, Edge)
      const win = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const SpeechRecognitionClass =
        win.SpeechRecognition || win.webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        try {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          recognition.onresult = (event: BrowserSpeechEvent) => {
            if (!isRecordingRef.current || isStoppingRef.current) return;

            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              const text = res[0]?.transcript || "";
              if (res.isFinal) {
                accumulatedFinalTranscriptRef.current = mergeTranscripts(
                  accumulatedFinalTranscriptRef.current,
                  text
                );
              } else {
                interimText += text;
              }
            }

            const currentDisplay = mergeTranscripts(
              accumulatedFinalTranscriptRef.current,
              interimText
            );
            speechTranscriptRef.current = currentDisplay;
            setLiveTranscript(currentDisplay);
          };

          recognition.onerror = () => {
            // Non-fatal error (e.g. no-speech, audio-capture). Continue recording with MediaRecorder.
          };

          // On mobile Android Chrome, recognition pauses after brief silence; restart automatically while actively recording
          recognition.onend = () => {
            if (!isRecordingRef.current || isStoppingRef.current) {
              return;
            }

            // Lock in current text before restart so nothing is lost
            if (speechTranscriptRef.current) {
              accumulatedFinalTranscriptRef.current = mergeTranscripts(
                accumulatedFinalTranscriptRef.current,
                speechTranscriptRef.current
              );
            }

            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              try {
                recognition.start();
              } catch {
                // Ignore transient restart restrictions
              }
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          // SpeechRecognition initialization fallback
        }
      }

      // Select supported audio mime type safely across desktop and mobile (iOS Safari / Android Chrome)
      let mimeType = "";
      try {
        if (
          typeof MediaRecorder !== "undefined" &&
          typeof MediaRecorder.isTypeSupported === "function"
        ) {
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/webm")) {
            mimeType = "audio/webm";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else if (MediaRecorder.isTypeSupported("audio/aac")) {
            mimeType = "audio/aac";
          }
        }
      } catch {
        mimeType = "";
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      startTimeRef.current = Date.now();
      elapsedTimeRef.current = 0;

      mediaRecorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      setIsPaused(false);

      // Duration counter (capped at 300 seconds / 5 minutes max audio size)
      timerRef.current = setInterval(() => {
        const ms = elapsedTimeRef.current + (Date.now() - startTimeRef.current);
        const secs = Math.floor(ms / 1000);
        setDuration(secs);
        if (secs >= 300 && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 250);
    } catch (err: unknown) {
      isRecordingRef.current = false;
      const isNotAllowed = err instanceof Error && err.name === "NotAllowedError";
      const message = err instanceof Error ? err.message : String(err);
      setError(
        isNotAllowed
          ? "Microphone access was denied. Please allow microphone permissions."
          : "Could not access microphone: " + message
      );
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
      elapsedTimeRef.current += Date.now() - startTimeRef.current;
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const ms = elapsedTimeRef.current + (Date.now() - startTimeRef.current);
        setDuration(Math.floor(ms / 1000));
      }, 250);
    }
  }, []);

  const stopRecording = useCallback((): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      isStoppingRef.current = true;
      isRecordingRef.current = false;

      if (timerRef.current) clearInterval(timerRef.current);

      let totalMs = elapsedTimeRef.current;
      if (mediaRecorderRef.current?.state === "recording") {
        totalMs += Date.now() - startTimeRef.current;
      }
      const calculatedDuration = Math.max(1, Math.round(totalMs / 1000));

      // Terminate speech recognition immediately and detach listeners so it NEVER restarts
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.onerror = null;
          speechRecognitionRef.current.onresult = null;
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }

      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === "inactive"
      ) {
        setIsRecording(false);
        setIsPaused(false);
        isStoppingRef.current = false;
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const rawMime = mediaRecorderRef.current?.mimeType || "audio/webm";
        // Strip codec parameter to prevent Whisper API format rejection
        const baseMime = rawMime.split(";")[0].trim() || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: baseMime });
        const url = URL.createObjectURL(blob);
        const finalTranscript = speechTranscriptRef.current.trim();

        // Cleanup audio stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (
          audioContextRef.current &&
          audioContextRef.current.state !== "closed"
        ) {
          audioContextRef.current.close().catch(() => {});
        }
        analyserRef.current = null;
        setAnalyser(null);

        setIsRecording(false);
        setIsPaused(false);
        isStoppingRef.current = false;

        resolve({
          blob,
          duration: calculatedDuration,
          url,
          browserTranscript: finalTranscript,
        });
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    isStoppingRef.current = true;
    isRecordingRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.abort();
      } catch {}
      speechRecognitionRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    analyserRef.current = null;
    setAnalyser(null);
    audioChunksRef.current = [];
    startTimeRef.current = 0;
    elapsedTimeRef.current = 0;
    setIsRecording(false);
    setIsPaused(false);
    isStoppingRef.current = false;
    setDuration(0);
    setLiveTranscript("");
    accumulatedFinalTranscriptRef.current = "";
    speechTranscriptRef.current = "";
  }, []);

  const formattedTime = `${Math.floor(duration / 60)
    .toString()
    .padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}`;

  return {
    isRecording,
    isPaused,
    duration,
    formattedTime,
    liveTranscript,
    error,
    analyser,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  };
}
