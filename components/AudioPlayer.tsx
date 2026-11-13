"use client";

import { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  src: string;
  initialDuration?: number;
}

export function AudioPlayer({ src, initialDuration = 0 }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Canonical duration: if initialDuration was provided from the recorder timer, trust it completely
  const duration = initialDuration > 0 ? initialDuration : mediaDuration;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // If initialDuration is already known and valid, do not corrupt it with browser hacks
      if (initialDuration > 0) {
        return;
      }

      if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 3600) {
        setMediaDuration(Math.round(audio.duration));
      } else if (audio.duration === Infinity) {
        // Fallback for Chromium WebM duration bug only when initialDuration is unknown
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null;
          if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 3600) {
            setMediaDuration(Math.round(audio.duration));
          } else if (Number.isFinite(audio.currentTime) && audio.currentTime > 0 && audio.currentTime < 3600) {
            setMediaDuration(Math.round(audio.currentTime));
          }
          audio.currentTime = 0;
        };
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (duration > 0 && audio.currentTime >= duration) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [duration, initialDuration]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextSpeed =
      speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const format = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus:outline-none"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4 fill-current ml-0.5" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Time & Scrubber */}
      <div className="flex flex-1 flex-col gap-1">
        <input
          type="range"
          min={0}
          max={Math.max(duration, currentTime, 1)}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-indigo-600 dark:bg-zinc-700"
        />
        <div className="flex justify-between text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
          <span>{format(currentTime)}</span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            {format(duration)}
          </span>
        </div>
      </div>

      {/* Speed multiplier pill */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {playbackRate}x
      </button>
    </div>
  );
}

