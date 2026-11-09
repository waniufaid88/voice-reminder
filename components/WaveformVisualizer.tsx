"use client";

import { useEffect, useRef } from "react";

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null;
  isPaused?: boolean;
}

export function WaveformVisualizer({
  analyser,
  isPaused = false,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameId.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyser && !isPaused) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Flat or subtle idle wave when paused
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = isPaused ? 15 : 0;
        }
      }

      const barCount = 32;
      const barSpacing = 4;
      const totalSpacing = (barCount - 1) * barSpacing;
      const barWidth = Math.max(3, (width - totalSpacing) / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] || 0;
        const percent = value / 255;
        // Min bar height 4px, max bar height canvas height - 8px
        const barHeight = Math.max(4, percent * (height - 8));
        const x = i * (barWidth + barSpacing);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, "#818cf8");
        gradient.addColorStop(1, "#4f46e5");

        ctx.fillStyle = isPaused ? "#94a3b8" : gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    render();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [analyser, isPaused]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={38}
      className="h-9 w-60 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/80"
    />
  );
}

