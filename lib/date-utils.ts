/**
 * Converts a UTC timestamp into a "YYYY-MM-DDTHH:mm" string in the user's LOCAL timezone
 * suitable for <input type="datetime-local" />.
 */
export function formatLocalDatetime(timestamp?: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Parses a "YYYY-MM-DDTHH:mm" string from <input type="datetime-local" />
 * into an epoch timestamp (ms) in the user's LOCAL timezone.
 */
export function parseLocalDatetime(datetimeStr?: string | null): number | undefined {
  if (!datetimeStr || !datetimeStr.trim()) return undefined;

  const [datePart, timePart] = datetimeStr.trim().split("T");
  if (!datePart || !timePart) return undefined;

  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hours) ||
    isNaN(minutes)
  ) {
    return undefined;
  }

  // Construct explicitly in the user's local timezone
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return isNaN(localDate.getTime()) ? undefined : localDate.getTime();
}

/**
 * Formats a timestamp into a human-readable string in local timezone (e.g. "Today at 3:00 PM")
 */
export function formatReadableDueDate(timestamp?: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const dayOfWeek = date.toLocaleDateString([], { weekday: "short" });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow (${dayOfWeek}) at ${timeStr}`;

  return `${date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} at ${timeStr}`;
}

/**
 * Formats duration in seconds into a clean human string (e.g. "15s" or "1m 24s").
 */
export function formatAudioDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

/**
 * Checks if a timestamp falls within today in user's local timezone.
 */
export function isDateToday(timestamp?: number | null): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formats recurrence mode and days into human readable text (e.g. "Daily", "Mon, Wed, Fri", "Once")
 */
export function formatRecurrenceLabel(
  mode?: "once" | "daily" | "custom",
  days?: number[]
): string {
  if (mode === "daily") return "Every day";
  if (mode === "custom" && days && days.length > 0) {
    if (days.length === 7) return "Every day";
    const sortedDays = [...days].sort((a, b) => a - b);
    if (
      sortedDays.length === 5 &&
      sortedDays[0] === 1 &&
      sortedDays[1] === 2 &&
      sortedDays[2] === 3 &&
      sortedDays[3] === 4 &&
      sortedDays[4] === 5
    ) {
      return "Weekdays (Mon-Fri)";
    }
    if (sortedDays.length === 2 && sortedDays.includes(0) && sortedDays.includes(6)) {
      return "Weekends (Sat-Sun)";
    }
    return sortedDays.map((d) => DAY_NAMES_SHORT[d]).join(", ");
  }
  return "One time";
}

/**
 * Calculates the next recurrence date for daily or custom days recurrence
 */
export function calculateNextRecurrence(
  baseDueDateMs: number,
  mode: "daily" | "custom",
  customDays?: number[]
): number {
  const base = new Date(baseDueDateMs);
  const hours = base.getHours();
  const minutes = base.getMinutes();

  if (mode === "daily") {
    const todayAtTime = new Date();
    todayAtTime.setHours(hours, minutes, 0, 0);

    if (todayAtTime.getTime() > Date.now()) {
      return todayAtTime.getTime();
    }
    todayAtTime.setDate(todayAtTime.getDate() + 1);
    return todayAtTime.getTime();
  }

  // Custom days of week
  const days = customDays && customDays.length > 0 ? customDays : [new Date().getDay()];
  const today = new Date();
  const todayDay = today.getDay();
  const todayTime = new Date();
  todayTime.setHours(hours, minutes, 0, 0);

  if (days.includes(todayDay) && todayTime.getTime() > Date.now()) {
    return todayTime.getTime();
  }

  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date();
    candidate.setDate(today.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (days.includes(candidate.getDay())) {
      return candidate.getTime();
    }
  }

  return baseDueDateMs + 24 * 60 * 60 * 1000;
}



