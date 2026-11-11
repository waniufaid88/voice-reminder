"use client";

import React from "react";
import { DAY_NAMES_SHORT } from "@/lib/date-utils";

interface RecurrenceSelectorProps {
  mode: "once" | "daily" | "custom";
  selectedDays?: number[];
  onChangeMode: (mode: "once" | "daily" | "custom") => void;
  onChangeDays: (days: number[]) => void;
}

export function RecurrenceSelector({
  mode,
  selectedDays = [],
  onChangeMode,
  onChangeDays,
}: RecurrenceSelectorProps) {
  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      if (selectedDays.length === 1) return; // Keep at least one selected day
      onChangeDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      onChangeDays([...selectedDays, dayIndex].sort((a, b) => a - b));
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-100 mb-1 flex items-center gap-1.5">
          <span>🔁</span> Reminder Frequency
        </label>
        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mb-2.5">
          Choose when this reminder should notify you.
        </p>

        {/* 3 Frequency Options */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onChangeMode("once")}
            className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all border cursor-pointer ${
              mode === "once"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
            }`}
          >
            ⏰ Once
          </button>
          <button
            type="button"
            onClick={() => onChangeMode("daily")}
            className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all border cursor-pointer ${
              mode === "daily"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
            }`}
          >
            🔁 Daily
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeMode("custom");
              if (!selectedDays || selectedDays.length === 0) {
                onChangeDays([new Date().getDay()]);
              }
            }}
            className={`rounded-xl px-2 py-2 text-xs font-semibold transition-all border cursor-pointer ${
              mode === "custom"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
            }`}
          >
            📅 Custom Days
          </button>
        </div>
      </div>

      {/* Custom Days Picker */}
      {mode === "custom" && (
        <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 space-y-2">
          <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            Select days to remind:
          </label>
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES_SHORT.map((name, index) => {
              const isSelected = selectedDays.includes(index);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={`flex items-center justify-center h-9 sm:h-10 rounded-xl text-[11px] sm:text-xs font-bold transition-all border cursor-pointer ${
                    isSelected
                      ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                      : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                  title={name}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 font-medium text-center">
            {selectedDays.length === 7
              ? "Reminds every single day"
              : selectedDays.length === 0
              ? "Please select at least one day"
              : `Reminds every: ${selectedDays.map((d) => DAY_NAMES_SHORT[d]).join(", ")}`}
          </p>
        </div>
      )}
    </div>
  );
}

