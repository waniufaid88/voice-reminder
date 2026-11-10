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
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;

  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} at ${timeStr}`;
}

