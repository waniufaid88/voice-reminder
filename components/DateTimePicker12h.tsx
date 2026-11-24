"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, Clock, ChevronDown, Check } from "lucide-react";
import { formatReadableDueDate, parseLocalDatetime, formatLocalDatetime } from "@/lib/date-utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

interface DateTimePicker12hProps {
  value?: string; // "YYYY-MM-DDTHH:mm"
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function DateTimePicker12h({
  value,
  onChange,
  disabled = false,
}: DateTimePicker12hProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  // Parse current value or provide intelligent defaults (today, 03:00 PM)
  const { datePart, hour12, minuteStr, period, formattedPreview, dateObj } = useMemo(() => {
    let dPart = "";
    let h12 = 3;
    let mStr = "00";
    let p: "AM" | "PM" = "PM";

    if (value && value.includes("T")) {
      const [d, t] = value.split("T");
      dPart = d || "";
      if (t) {
        const [hRaw, mRaw] = t.split(":");
        const hNum = parseInt(hRaw, 10);
        const mNum = parseInt(mRaw, 10);
        if (!isNaN(hNum)) {
          p = hNum >= 12 ? "PM" : "AM";
          h12 = hNum % 12 === 0 ? 12 : hNum % 12;
        }
        if (!isNaN(mNum)) {
          mStr = mNum.toString().padStart(2, "0");
        }
      }
    } else {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      dPart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      h12 = 3;
      mStr = "00";
      p = "PM";
    }

    // Calculate timestamp preview
    let preview = "";
    let dObj: Date | null = null;
    if (dPart) {
      let h24 = h12 % 12;
      if (p === "PM") h24 += 12;
      const pad = (n: number) => n.toString().padStart(2, "0");
      const dtStr = `${dPart}T${pad(h24)}:${mStr}`;
      const ts = parseLocalDatetime(dtStr);
      if (ts) {
        preview = formatReadableDueDate(ts);
        dObj = new Date(ts);
      }
    }

    return {
      datePart: dPart,
      hour12: h12,
      minuteStr: mStr,
      period: p,
      formattedPreview: preview,
      dateObj: dObj,
    };
  }, [value]);

  const updateDatetime = (newDate: string, newH12: number, newMStr: string, newP: "AM" | "PM") => {
    let h24 = newH12 % 12;
    if (newP === "PM") h24 += 12;
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatted = `${newDate}T${pad(h24)}:${newMStr}`;
    onChange(formatted);
  };

  // Date selection handler
  const handleCalendarSelect = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const newDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    updateDatetime(newDateStr, hour12, minuteStr, period);
    setDateOpen(false);
  };

  // Quick date presets
  const applyDatePreset = (preset: "today" | "tomorrow" | "next_week") => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");

    if (preset === "today") {
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      updateDatetime(dateStr, hour12, minuteStr, period);
    } else if (preset === "tomorrow") {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
      updateDatetime(dateStr, hour12, minuteStr, period);
    } else if (preset === "next_week") {
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dateStr = `${nextWeek.getFullYear()}-${pad(nextWeek.getMonth() + 1)}-${pad(nextWeek.getDate())}`;
      updateDatetime(dateStr, hour12, minuteStr, period);
    }
    setDateOpen(false);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = parseInt(e.target.value, 10);
    updateDatetime(datePart, isNaN(val) ? 12 : val, minuteStr, period);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDatetime(datePart, hour12, e.target.value, period);
  };

  const setPeriod = (p: "AM" | "PM") => {
    updateDatetime(datePart, hour12, minuteStr, p);
  };

  // Minute dropdown options (00 to 59)
  const minuteOptions = Array.from({ length: 60 }, (_, i) =>
    i.toString().padStart(2, "0")
  );

  if (!minuteOptions.includes(minuteStr)) {
    minuteOptions.push(minuteStr);
    minuteOptions.sort();
  }

  // Nicely formatted date label
  const formattedDateLabel = useMemo(() => {
    if (!dateObj) return "Pick a date";
    const now = new Date();
    const isToday =
      now.getFullYear() === dateObj.getFullYear() &&
      now.getMonth() === dateObj.getMonth() &&
      now.getDate() === dateObj.getDate();

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const isTomorrow =
      tomorrow.getFullYear() === dateObj.getFullYear() &&
      tomorrow.getMonth() === dateObj.getMonth() &&
      tomorrow.getDate() === dateObj.getDate();

    if (isToday) {
      return `Today (${dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
    }
    if (isTomorrow) {
      return `Tomorrow (${dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
    }
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [dateObj]);

  // Nicely formatted time label
  const formattedTimeLabel = `${hour12.toString().padStart(2, "0")}:${minuteStr} ${period}`;

  return (
    <div className="space-y-2">
      {/* 2-Column Responsive Grid: Same row on both mobile and web */}
      <div className="grid grid-cols-2 gap-2">
        {/* 1. SEPARATE DATE PICKER (SHADCN POPOVER + CALENDAR) */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <CalendarIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            <span>Date</span>
          </label>

          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-2 sm:px-3 py-2 text-xs font-medium text-zinc-900 shadow-2xs transition-colors hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-[#1a1b2e] dark:text-zinc-100 dark:hover:border-white/20 cursor-pointer min-w-0"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 truncate">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300 shrink-0">
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate font-semibold text-left">{formattedDateLabel}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0 ml-1" />
              </button>
            </PopoverTrigger>

            <PopoverContent className="w-[300px] max-w-[calc(100vw-32px)] p-3 space-y-2.5 z-[60]" align="start">
              {/* Quick Date Presets */}
              <div className="flex items-center gap-1 pb-1 border-b border-zinc-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => applyDatePreset("today")}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:text-purple-600 hover:bg-purple-50 dark:text-zinc-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset("tomorrow")}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:text-purple-600 hover:bg-purple-50 dark:text-zinc-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset("next_week")}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:text-purple-600 hover:bg-purple-50 dark:text-zinc-400 dark:hover:text-purple-300 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                >
                  Next Week
                </button>
              </div>

              {/* Shadcn Calendar Component */}
              <div className="rounded-xl border border-zinc-100 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-zinc-900/30 p-1">
                <Calendar
                  selected={datePart}
                  onSelect={handleCalendarSelect}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 2. SEPARATE TIME PICKER (SHADCN POPOVER + TIME CONTROLS) */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Clock className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
            <span>Time</span>
          </label>

          <Popover open={timeOpen} onOpenChange={setTimeOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-2 sm:px-3 py-2 text-xs font-medium text-zinc-900 shadow-2xs transition-colors hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-[#1a1b2e] dark:text-zinc-100 dark:hover:border-white/20 cursor-pointer min-w-0"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 truncate">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate font-semibold text-left">{formattedTimeLabel}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0 ml-1" />
              </button>
            </PopoverTrigger>

            <PopoverContent className="w-[230px] p-3 space-y-2.5 z-[60]" align="end">
              {/* 12-Hour Custom Time Selectors */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
                  Custom Time
                </span>
                <div className="flex items-center justify-between gap-1.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-2 border border-zinc-200/70 dark:border-white/[0.06]">
                  {/* Hour (1-12) */}
                  <div className="flex items-center">
                    <select
                      value={hour12}
                      onChange={handleHourChange}
                      disabled={disabled}
                      aria-label="Hour (1-12)"
                      className="rounded-lg bg-white dark:bg-zinc-800 px-1.5 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 shadow-2xs border border-zinc-200 dark:border-white/[0.08] focus:outline-none cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                        <option key={h} value={h} className="dark:bg-zinc-800">
                          {h.toString().padStart(2, "0")}
                        </option>
                      ))}
                    </select>

                    <span className="text-zinc-400 font-bold px-1">:</span>

                    {/* Minute (00-59) */}
                    <select
                      value={minuteStr}
                      onChange={handleMinuteChange}
                      disabled={disabled}
                      aria-label="Minute"
                      className="rounded-lg bg-white dark:bg-zinc-800 px-1.5 py-1 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 shadow-2xs border border-zinc-200 dark:border-white/[0.08] focus:outline-none cursor-pointer"
                    >
                      {minuteOptions.map((m) => (
                        <option key={m} value={m} className="dark:bg-zinc-800">
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* AM / PM Segmented Toggle */}
                  <div className="flex items-center rounded-lg bg-zinc-200/70 dark:bg-zinc-800 p-0.5 border border-zinc-300/60 dark:border-white/[0.08]">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setPeriod("AM")}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                        period === "AM"
                          ? "bg-white text-purple-600 shadow-xs dark:bg-zinc-900 dark:text-purple-400"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setPeriod("PM")}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                        period === "PM"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Done button */}
              <div className="flex justify-end pt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTimeOpen(false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="h-3 w-3" />
                  <span>Done</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Live Formatted Confirmation Badge */}
      {formattedPreview && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 pt-0.5">
          <span>🔔</span>
          <span>Scheduled for: {formattedPreview}</span>
        </div>
      )}
    </div>
  );
}
