"use client";

import { useMemo } from "react";
import { formatReadableDueDate, parseLocalDatetime } from "@/lib/date-utils";

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
  // Parse current value or provide intelligent defaults (today, 03:00 PM)
  const { datePart, hour12, minuteStr, period, formattedPreview } = useMemo(() => {
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
    if (dPart) {
      let h24 = h12 % 12;
      if (p === "PM") h24 += 12;
      const pad = (n: number) => n.toString().padStart(2, "0");
      const dtStr = `${dPart}T${pad(h24)}:${mStr}`;
      const ts = parseLocalDatetime(dtStr);
      if (ts) {
        preview = formatReadableDueDate(ts);
      }
    }

    return {
      datePart: dPart,
      hour12: h12,
      minuteStr: mStr,
      period: p,
      formattedPreview: preview,
    };
  }, [value]);

  const updateDatetime = (newDate: string, newH12: number, newMStr: string, newP: "AM" | "PM") => {
    let h24 = newH12 % 12;
    if (newP === "PM") h24 += 12;
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatted = `${newDate}T${pad(h24)}:${newMStr}`;
    onChange(formatted);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateDatetime(e.target.value, hour12, minuteStr, period);
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

  const minuteOptions = [
    "00", "05", "10", "15", "20", "25",
    "30", "35", "40", "45", "50", "55"
  ];

  // Include current minute if it's not a multiple of 5
  if (!minuteOptions.includes(minuteStr)) {
    minuteOptions.push(minuteStr);
    minuteOptions.sort();
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Date input */}
        <div className="flex-1 min-w-[140px]">
          <input
            type="date"
            value={datePart}
            onChange={handleDateChange}
            disabled={disabled}
            aria-label="Due Date"
            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-zinc-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* 12-Hour Time & AM/PM Controls */}
        <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 shadow-sm">
          {/* Hour (1-12) */}
          <div className="flex items-center">
            <select
              value={hour12}
              onChange={handleHourChange}
              disabled={disabled}
              aria-label="Hour (1-12)"
              className="rounded-md bg-transparent px-1.5 py-1 text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                <option key={h} value={h} className="dark:bg-zinc-800">
                  {h.toString().padStart(2, "0")}
                </option>
              ))}
            </select>

            <span className="text-zinc-400 font-bold px-0.5">:</span>

            {/* Minute (00-55) */}
            <select
              value={minuteStr}
              onChange={handleMinuteChange}
              disabled={disabled}
              aria-label="Minute"
              className="rounded-md bg-transparent px-1.5 py-1 text-xs sm:text-sm font-mono font-bold text-zinc-800 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {minuteOptions.map((m) => (
                <option key={m} value={m} className="dark:bg-zinc-800">
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* AM / PM Segmented Toggle */}
          <div className="flex items-center rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-700/60">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPeriod("AM")}
              className={`rounded px-2 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                period === "AM"
                  ? "bg-white text-indigo-600 shadow-sm dark:bg-zinc-800 dark:text-indigo-400"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              }`}
            >
              AM
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPeriod("PM")}
              className={`rounded px-2 py-0.5 text-[11px] font-bold transition-all cursor-pointer ${
                period === "PM"
                  ? "bg-indigo-600 text-white shadow-sm dark:bg-indigo-500"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              }`}
            >
              PM
            </button>
          </div>
        </div>
      </div>

      {/* Live Formatted Confirmation Badge */}
      {formattedPreview && (
        <div className="flex items-center gap-1.5 pt-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
          <span>🔔</span>
          <span>Exact Time: {formattedPreview}</span>
        </div>
      )}
    </div>
  );
}

