"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
  };
}
interface BrowserSpeechEvent extends Event {
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
  onerror: (() => void) | null;
}

export interface RecordingResult {
  blob: Blob;
  duration: number;
  url: string;
  browserTranscript: string;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechTranscriptRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const elapsedTimeRef = useRef<number>(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
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
          speechRecognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    audioChunksRef.current = [];
    setDuration(0);
    setLiveTranscript("");
    speechTranscriptRef.current = "";
    startTimeRef.current = Date.now();
    elapsedTimeRef.current = 0;

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
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

      // Setup in-browser Web Speech API transcription (Chrome, Edge, Safari)
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
            let fullText = "";
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + " ";
            }
            const clean = fullText.trim();
            speechTranscriptRef.current = clean;
            setLiveTranscript(clean);
          };

          recognition.onerror = () => {
            // Non-fatal, continue with audio recording
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
        if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
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
      if (timerRef.current) clearInterval(timerRef.current);

      let totalMs = elapsedTimeRef.current;
      if (mediaRecorderRef.current?.state === "recording") {
        totalMs += Date.now() - startTimeRef.current;
      }
      const calculatedDuration = Math.max(1, Math.round(totalMs / 1000));

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }

      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === "inactive"
      ) {
        setIsRecording(false);
        setIsPaused(false);
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
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
    if (timerRef.current) clearInterval(timerRef.current);
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
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
    setDuration(0);
    setLiveTranscript("");
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
