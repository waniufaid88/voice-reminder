"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  selected?: Date | string | null;
  onSelect?: (date: Date) => void;
  minDate?: Date;
  className?: string;
}

export function Calendar({
  selected,
  onSelect,
  minDate,
  className,
}: CalendarProps) {
  const selectedDate = React.useMemo(() => {
    if (!selected) return null;
    if (typeof selected === "string") {
      const parts = selected.split("T")[0].split("-");
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      const d = new Date(selected);
      return isNaN(d.getTime()) ? null : d;
    }
    return selected;
  }, [selected]);

  // View state: currently displayed month & year
  const [viewDate, setViewDate] = React.useState<Date>(() => {
    return selectedDate ? new Date(selectedDate) : new Date();
  });

  // Keep viewDate in sync when a different selected date is passed
  React.useEffect(() => {
    if (selectedDate) {
      setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const currentYear = new Date().getFullYear();
  // Generate year options from currentYear - 5 to currentYear + 15
  const yearOptions = React.useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 15; y++) {
      years.push(y);
    }
    if (!years.includes(year)) {
      years.push(year);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [currentYear, year]);

  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Navigation handlers
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value, 10);
    setViewDate(new Date(year, newMonth, 1));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value, 10);
    setViewDate(new Date(newYear, month, 1));
  };

  // Month calculation
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const isSameDay = (d1: Date, d2: Date | null) => {
    if (!d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  // Calendar cells
  const calendarCells = React.useMemo(() => {
    const cells: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // 1. Previous month trailing days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      cells.push({
        date: d,
        isCurrentMonth: false,
        isSelected: isSameDay(d, selectedDate),
        isToday: isSameDay(d, today),
      });
    }

    // 2. Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({
        date: d,
        isCurrentMonth: true,
        isSelected: isSameDay(d, selectedDate),
        isToday: isSameDay(d, today),
      });
    }

    // 3. Next month leading days to complete the 35 or 42 grid
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      cells.push({
        date: d,
        isCurrentMonth: false,
        isSelected: isSameDay(d, selectedDate),
        isToday: isSameDay(d, today),
      });
    }

    return cells;
  }, [year, month, firstDayOfMonth, daysInCurrentMonth, daysInPrevMonth, selectedDate, today]);

  return (
    <div className={cn("p-1 select-none", className)}>
      {/* Month & Navigation Header */}
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-zinc-100 dark:border-white/[0.06] gap-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
          title="Previous Month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {/* Month Dropdown */}
          <select
            value={month}
            onChange={handleMonthChange}
            aria-label="Select Month"
            className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none cursor-pointer"
          >
            {monthNames.map((name, idx) => (
              <option key={name} value={idx} className="dark:bg-zinc-800">
                {name}
              </option>
            ))}
          </select>

          {/* Year Dropdown */}
          <select
            value={year}
            onChange={handleYearChange}
            aria-label="Select Year"
            className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none cursor-pointer"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} className="dark:bg-zinc-800">
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
          title="Next Month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {daysOfWeek.map((dow) => (
          <div key={dow} className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 py-0.5">
            {dow}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarCells.map((cell, idx) => {
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect?.(cell.date);
              }}
              className={cn(
                "h-7 w-7 sm:h-8 sm:w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all cursor-pointer",
                cell.isSelected &&
                  "bg-purple-600 text-white font-bold hover:bg-purple-700 shadow-sm shadow-purple-600/30",
                !cell.isSelected && cell.isCurrentMonth &&
                  "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
                !cell.isSelected && !cell.isCurrentMonth &&
                  "text-zinc-300 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-white/[0.03]",
                cell.isToday && !cell.isSelected &&
                  "border border-purple-500/40 text-purple-600 dark:text-purple-400 font-bold"
              )}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
