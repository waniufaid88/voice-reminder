/**
 * Natural language date, time, and recurrence parser.
 * Extracts exact days, times, and recurrence frequencies from user text or voice transcripts.
 */

export interface ParsedNaturalReminder {
  isReminder: boolean;
  title: string;
  dueDate?: number; // epoch timestamp in ms (local time)
  dueDateLocal?: string; // "YYYY-MM-DDTHH:mm" for datetime-local input
  recurrenceMode?: "once" | "daily" | "custom";
  recurrenceDays?: number[];
  detectedTime?: { hours: number; minutes: number };
  detectedDayName?: string;
}

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTH_MAP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatToLocalDatetimeString(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function parseNaturalReminder(
  rawText: string,
  referenceDate: Date = new Date()
): ParsedNaturalReminder {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Check if input is likely a reminder
  const reminderKeywords = [
    "remind",
    "reminder",
    "schedule",
    "appointment",
    "meeting",
    "deadline",
    "due",
    "tomorrow",
    "tonight",
    "alarm",
    "at ",
    "on monday",
    "on tuesday",
    "on wednesday",
    "on thursday",
    "on friday",
    "on saturday",
    "on sunday",
    "every day",
    "daily",
  ];

  const hasReminderKeyword = reminderKeywords.some((kw) => lower.includes(kw));

  // Time pattern check (e.g. 5pm, 4:30 pm, at 10)
  const hasTimePattern =
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text) ||
    /\bat\s+\d{1,2}(?::\d{2})?\b/i.test(text) ||
    /\bin\s+\d+\s*(?:minute|min|hour|hr|day)s?\b/i.test(text);

  const isReminder = hasReminderKeyword || hasTimePattern;

  // 2. Detect Recurrence
  let recurrenceMode: "once" | "daily" | "custom" = "once";
  let recurrenceDays: number[] | undefined = undefined;

  if (
    lower.includes("daily") ||
    lower.includes("every day") ||
    lower.includes("everyday") ||
    lower.includes("each day")
  ) {
    recurrenceMode = "daily";
  } else if (lower.includes("weekday") || lower.includes("weekdays")) {
    recurrenceMode = "custom";
    recurrenceDays = [1, 2, 3, 4, 5];
  } else if (lower.includes("weekend") || lower.includes("weekends")) {
    recurrenceMode = "custom";
    recurrenceDays = [0, 6];
  } else {
    // Check for "every monday and wednesday", "every friday", etc.
    const customDaysFound = new Set<number>();
    const everyDayMatch = lower.match(
      /\b(?:every|on)\s+([a-z\s,and]+?)(?:\s+at|\s+in|\s+for|$)/i
    );
    if (everyDayMatch) {
      const dayTokens = everyDayMatch[1].split(/[\s,]+and[\s,]+|[\s,]+/);
      for (const token of dayTokens) {
        const cleaned = token.replace(/s$/, ""); // e.g. "mondays" -> "monday"
        if (DAY_MAP[cleaned] !== undefined) {
          customDaysFound.add(DAY_MAP[cleaned]);
        }
      }
    }

    if (customDaysFound.size > 0 && lower.includes("every")) {
      recurrenceMode = "custom";
      recurrenceDays = Array.from(customDaysFound).sort((a, b) => a - b);
    }
  }

  // 3. Extract Time of Day (Hours and Minutes)
  let extractedHours: number | null = null;
  let extractedMinutes: number | null = null;

  // Case 3a: Relative time (e.g. "in 15 minutes", "in 2 hours", "in 3 days")
  const relativeMatch = lower.match(
    /\bin\s+(\d+)\s*(minute|min|minutes|mins|hour|hr|hours|hrs|day|days)\b/i
  );
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const targetDate = new Date(referenceDate);

    if (unit.startsWith("min")) {
      targetDate.setMinutes(targetDate.getMinutes() + amount);
    } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
      targetDate.setHours(targetDate.getHours() + amount);
    } else if (unit.startsWith("day")) {
      targetDate.setDate(targetDate.getDate() + amount);
    }

    const title = cleanReminderTitle(text);
    return {
      isReminder: true,
      title,
      dueDate: targetDate.getTime(),
      dueDateLocal: formatToLocalDatetimeString(targetDate),
      recurrenceMode,
      recurrenceDays,
      detectedTime: { hours: targetDate.getHours(), minutes: targetDate.getMinutes() },
    };
  }

  // Case 3b: "HH:MM am/pm" or "H:MM am/pm" or "H.MM am/pm"
  const timeWithMinutes12h = lower.match(
    /\b(\d{1,2})[:.](\d{2})\s*(am|pm)\b/i
  );
  if (timeWithMinutes12h) {
    let h = parseInt(timeWithMinutes12h[1], 10);
    const m = parseInt(timeWithMinutes12h[2], 10);
    const meridian = timeWithMinutes12h[3].toLowerCase();

    if (meridian === "pm" && h < 12) h += 12;
    if (meridian === "am" && h === 12) h = 0;
    extractedHours = h;
    extractedMinutes = m;
  }

  // Case 3c: "H am/pm" or "HH am/pm" (e.g. "5 pm", "10am", "at 9 PM")
  if (extractedHours === null) {
    const timeNoMinutes12h = lower.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    if (timeNoMinutes12h) {
      let h = parseInt(timeNoMinutes12h[1], 10);
      const meridian = timeNoMinutes12h[2].toLowerCase();

      if (meridian === "pm" && h < 12) h += 12;
      if (meridian === "am" && h === 12) h = 0;
      extractedHours = h;
      extractedMinutes = 0;
    }
  }

  // Case 3d: "at HH:MM" 24-hour format (e.g. "at 16:30", "at 09:15")
  if (extractedHours === null) {
    const time24h = lower.match(/\bat\s+(\d{1,2})[:.](\d{2})\b/i);
    if (time24h) {
      extractedHours = parseInt(time24h[1], 10);
      extractedMinutes = parseInt(time24h[2], 10);
    }
  }

  // Case 3e: "at H o'clock" (e.g. "at 5 o'clock", "at 7 o'clock pm")
  if (extractedHours === null) {
    const oclockMatch = lower.match(/\bat\s+(\d{1,2})\s*o'?clock(?:\s*(am|pm))?\b/i);
    if (oclockMatch) {
      let h = parseInt(oclockMatch[1], 10);
      const meridian = oclockMatch[2]?.toLowerCase();
      if (meridian === "pm" && h < 12) h += 12;
      if (meridian === "am" && h === 12) h = 0;
      if (!meridian) {
        // If hour between 1 and 6, default to afternoon/evening
        if (h >= 1 && h <= 6) h += 12;
      }
      extractedHours = h;
      extractedMinutes = 0;
    }
  }

  // Case 3f: "at H" (e.g. "at 5", "at 10", "at 4")
  if (extractedHours === null) {
    const atHourMatch = lower.match(/\bat\s+(\d{1,2})\b(?!\s*[:.\d])/i);
    if (atHourMatch) {
      let h = parseInt(atHourMatch[1], 10);
      if (h >= 1 && h <= 12) {
        if (lower.includes("morning")) {
          if (h === 12) h = 0;
        } else if (
          lower.includes("evening") ||
          lower.includes("night") ||
          lower.includes("afternoon") ||
          lower.includes("tonight")
        ) {
          if (h < 12) h += 12;
        } else {
          // Heuristic: hours 1 to 7 usually mean afternoon/evening (e.g. "meeting at 4" = 16:00)
          if (h >= 1 && h <= 6) h += 12;
        }
        extractedHours = h;
        extractedMinutes = 0;
      }
    }
  }

  // Case 3g: Named times of day
  if (extractedHours === null) {
    if (lower.includes("noon") || lower.includes("midday")) {
      extractedHours = 12;
      extractedMinutes = 0;
    } else if (lower.includes("midnight")) {
      extractedHours = 0;
      extractedMinutes = 0;
    } else if (lower.includes("tonight") || lower.includes("at night")) {
      extractedHours = 20; // 8:00 PM
      extractedMinutes = 0;
    } else if (lower.includes("evening") || lower.includes("in the evening")) {
      extractedHours = 18; // 6:00 PM
      extractedMinutes = 0;
    } else if (lower.includes("afternoon") || lower.includes("in the afternoon")) {
      extractedHours = 14; // 2:00 PM
      extractedMinutes = 0;
    } else if (lower.includes("morning") || lower.includes("in the morning")) {
      extractedHours = 9; // 9:00 AM
      extractedMinutes = 0;
    }
  }

  // 4. Extract Target Day / Date
  const targetDate = new Date(referenceDate);
  let dayExplicitlyFound = false;

  if (lower.includes("day after tomorrow")) {
    targetDate.setDate(targetDate.getDate() + 2);
    dayExplicitlyFound = true;
  } else if (lower.includes("tomorrow") || lower.includes("tmrw") || lower.includes("tom")) {
    targetDate.setDate(targetDate.getDate() + 1);
    dayExplicitlyFound = true;
  } else if (lower.includes("today") || lower.includes("tonight")) {
    // targetDate stays today
    dayExplicitlyFound = true;
  } else {
    // Check for days of the week: "monday", "friday", "on saturday", etc.
    for (const [dayName, targetDayNum] of Object.entries(DAY_MAP)) {
      const dayRegex = new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+)?${dayName}\\b`, "i");
      if (dayRegex.test(lower)) {
        const currentDayNum = referenceDate.getDay();
        let daysUntil = (targetDayNum - currentDayNum + 7) % 7;

        // If today is the day mentioned, but the user specifies a time:
        if (daysUntil === 0) {
          if (extractedHours !== null) {
            const candidate = new Date(referenceDate);
            candidate.setHours(extractedHours, extractedMinutes || 0, 0, 0);
            if (candidate.getTime() <= referenceDate.getTime()) {
              // Time has already passed today, so user means next week
              daysUntil = 7;
            }
          } else {
            daysUntil = 7;
          }
        }

        targetDate.setDate(targetDate.getDate() + daysUntil);
        dayExplicitlyFound = true;
        break;
      }
    }

    // Check for specific date (e.g. "15th nov", "november 20", "nov 12")
    if (!dayExplicitlyFound) {
      for (const [monthName, monthIndex] of Object.entries(MONTH_MAP)) {
        const dateMatch =
          lower.match(
            new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}\\b`, "i")
          ) ||
          lower.match(
            new RegExp(`\\b(?:on\\s+)?${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i")
          );

        if (dateMatch) {
          const dayNum = parseInt(dateMatch[1], 10);
          targetDate.setMonth(monthIndex, dayNum);
          if (targetDate.getTime() < referenceDate.getTime() - 24 * 60 * 60 * 1000) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          dayExplicitlyFound = true;
          break;
        }
      }
    }
  }

  // 5. Combine Target Date with Target Time
  let finalDueDate: number | undefined = undefined;

  if (extractedHours !== null) {
    const mins = extractedMinutes || 0;
    targetDate.setHours(extractedHours, mins, 0, 0);

    // If day was NOT explicitly mentioned, but a time was given:
    // e.g. "meeting at 4:00 pm" or "call at 10 am"
    if (!dayExplicitlyFound) {
      if (targetDate.getTime() <= referenceDate.getTime()) {
        // That time today has already passed, schedule for tomorrow at that time!
        targetDate.setDate(targetDate.getDate() + 1);
      }
    }
    finalDueDate = targetDate.getTime();
  } else if (dayExplicitlyFound) {
    // Day was mentioned, but no specific time -> default to 9:00 AM on that day
    targetDate.setHours(9, 0, 0, 0);
    // If 9 AM on that day is already past (e.g. user said "today" in afternoon), default to +2 hours
    if (targetDate.getTime() <= referenceDate.getTime()) {
      targetDate.setTime(referenceDate.getTime() + 2 * 60 * 60 * 1000);
    }
    finalDueDate = targetDate.getTime();
  } else if (isReminder) {
    // General reminder with no day or time specified -> default to +2 hours
    targetDate.setTime(referenceDate.getTime() + 2 * 60 * 60 * 1000);
    finalDueDate = targetDate.getTime();
  }

  const title = cleanReminderTitle(text);

  return {
    isReminder,
    title,
    dueDate: finalDueDate,
    dueDateLocal: finalDueDate ? formatToLocalDatetimeString(new Date(finalDueDate)) : undefined,
    recurrenceMode,
    recurrenceDays,
    detectedTime:
      extractedHours !== null
        ? { hours: extractedHours, minutes: extractedMinutes || 0 }
        : undefined,
  };
}

/**
 * Cleans the raw user text into a concise title by removing reminder prefixes.
 */
function cleanReminderTitle(rawText: string): string {
  let cleaned = rawText
    .replace(/^remind\s+me\s+(?:to\s+|about\s+|that\s+)?/i, "")
    .replace(/^please\s+remind\s+me\s+(?:to\s+|about\s+|that\s+)?/i, "")
    .replace(/^set\s+a\s+reminder\s+(?:for\s+|to\s+)?/i, "")
    .replace(/^reminder\s*:\s*/i, "")
    .replace(/^create\s+a\s+reminder\s+(?:for\s+|to\s+)?/i, "")
    .trim();

  if (!cleaned) cleaned = rawText.trim() || "Reminder";

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

