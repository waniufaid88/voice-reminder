
/**
 * Natural language date, time, and recurrence parser.
 * Extracts exact days, times, and recurrence frequencies from user text or voice transcripts.
 * Fully timezone-aware: immune to server/production UTC timezone variance.
 */

import { cleanChecklistItem, splitChecklistItems } from "./checklist-cleaner";

export interface ParsedNaturalReminder {
  isReminder: boolean;
  title: string;
  dueDate?: number; // epoch timestamp in ms (UTC)
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

export function formatToLocalDatetimeString(
  year: number,
  monthIndex: number,
  day: number,
  hours: number,
  minutes: number
): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}`;
}

export function parseNaturalReminder(
  rawText: string,
  referenceDate: Date = new Date(),
  clientTimezoneOffset?: number
): ParsedNaturalReminder {
  // Normalize input string: handle "p.m.", "a.m.", "p.m", "a.m", periods in times
  const normalizedText = rawText
    .replace(/\bp\.m\.?/gi, "pm")
    .replace(/\ba\.m\.?/gi, "am")
    .replace(/(\d{1,2})\s*\.\s*(\d{2})\s*(am|pm)/gi, "$1:$2 $3")
    .trim();
  const lower = normalizedText.toLowerCase();

  // Resolve timezone offset in minutes (e.g. -330 for IST UTC+5:30)
  const offset =
    clientTimezoneOffset !== undefined
      ? clientTimezoneOffset
      : typeof window !== "undefined"
        ? new Date().getTimezoneOffset()
        : 0;

  // Compute the user's wall clock date (UTC getters return the user's local year/month/day/hour/min)
  const userWallClockDate = new Date(referenceDate.getTime() - offset * 60 * 1000);
  const userYear = userWallClockDate.getUTCFullYear();
  const userMonth = userWallClockDate.getUTCMonth();
  const userDay = userWallClockDate.getUTCDate();
  const userDayOfWeek = userWallClockDate.getUTCDay();
  const userHours = userWallClockDate.getUTCHours();
  const userMinutes = userWallClockDate.getUTCMinutes();

  // 1. Check if input is likely a reminder.
  // Explicit reminder request keywords:
  const explicitReminderPattern =
    /\b(remind|reminder|alarm|due\s+date)\b/i.test(normalizedText) ||
    /\b(?:don't|do\s+not)\s+let\s+me\s+forget\b/i.test(normalizedText) ||
    /\b(?:alert|notify|ping|wake)\s+me\b/i.test(normalizedText) ||
    /\b(schedule|set)\s+(?:a\s+)?(?:reminder|alarm)\b/i.test(normalizedText);

  // Strip leading team/group prefixes like "in Team X,", "for Team X,", "Team X:"
  const textWithoutTeam = normalizedText
    .replace(/^(?:(?:in|for|to|at)\s+(?:the\s+)?(?:team\s+)?[\w\s-]{1,30}\s*[,:]\s*(?!\d{2})|[a-zA-Z][\w\s-]{0,29}\s*:\s*(?!\d{2}))/i, "")
    .trim();

  // Specific times: 5 PM, 4:30 AM, at 10, in 2 hours, after 30 mins, 17:00, noon, midnight
  const hasTimePattern =
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(normalizedText) ||
    /\bat\s+\d{1,2}(?::\d{2})?\b/i.test(normalizedText) ||
    /\b(?:in|after)\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)\b/i.test(normalizedText) ||
    /\b(?:noon|midday|midnight)\b/i.test(normalizedText) ||
    /\b(?:at\s+)?([01]?\d|2[0-3])[:.][0-5]\d\b/i.test(normalizedText);

  // Explicit future dates: today, tomorrow, monday, 5th december, 1st january
  const hasDatePattern =
    /\b(?:today|tomorrow|tmrw|tonight|day\s+after\s+tomorrow)\b/i.test(normalizedText) ||
    /\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(normalizedText) ||
    /\b(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?)\b/i.test(normalizedText);

  // Actionable commitment verbs: "call", "pay", "submit", "attend", "meet", "send", "go shopping", etc.
  const hasActionVerb =
    /\b(?:call|phone|ring|pay|submit|attend|meet|send|email|buy|pick\s+up|clean|wash|take|drink|check|finish|complete|wake(?:\s+up)?|visit|drop|collect|deliver|post|write|order|renew|cancel|book|schedule|remind|go(?:\s+to|\s+for|\s+shopping|\s+out)?|head(?:\s+to)?|walk|run|exercise|workout|gym|study|read|cook|eat|sleep|start|leave|get|shop)\b/i.test(
      textWithoutTeam
    );

  const isImperativeAction =
    /^(?:please\s+)?(?:call|phone|ring|pay|submit|attend|meet|send|email|buy|pick\s+up|clean|wash|take|drink|check|finish|complete|wake(?:\s+up)?|visit|drop|collect|deliver|post|write|order|renew|cancel|book|schedule|go(?:\s+to|\s+for|\s+shopping|\s+out)?|head(?:\s+to)?|walk|run|exercise|workout|gym|study|read|cook|eat|sleep|start|leave|get|shop)\b/i.test(
      textWithoutTeam
    ) ||
    /^(?:(?:today|tomorrow)\s+)?(?:i|we)\s+(?:will|shall|have\s+to|need\s+to|must|should|gotta|got\s+to|am\s+going\s+to|'ll)\s+(?:call|phone|ring|pay|submit|attend|meet|send|email|buy|pick\s+up|clean|wash|take|drink|check|finish|complete|wake(?:\s+up)?|visit|drop|collect|deliver|post|write|order|renew|cancel|book|schedule|go(?:\s+to|\s+for|\s+shopping|\s+out)?|head(?:\s+to)?|walk|run|exercise|workout|gym|study|read|cook|eat|sleep|start|leave|get|shop)\b/i.test(
      textWithoutTeam
    ) ||
    hasActionVerb;

  // Distinguish from learning thoughts, personal goals or meeting agendas:
  const isGeneralNoteOrIdea =
    /\b(?:want|plan|hope)\s+to\s+learn\b/i.test(lower) ||
    /\b(?:learning\s+goal|my\s+idea\s+is|thought\s+about|learned\s+that|learned\s+about)\b/i.test(lower) ||
    /\b(?:meeting|discussion)\s+(?:will\s+focus\s+on|focused\s+on|discussed|agenda\s+is)\b/i.test(lower);

  const isReminder =
    !isGeneralNoteOrIdea &&
    (explicitReminderPattern ||
      ((hasTimePattern || hasDatePattern) && (hasActionVerb || isImperativeAction)));

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
        const cleaned = token.replace(/s$/, "");

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

  // Case 3a: Relative time (e.g. "in 15 minutes", "in 2 hours", "in 3 days", "after 2 hours")
  const relativeMatch = lower.match(
    /\b(?:in|after)\s+(\d+)\s*(minute|min|minutes|mins|hour|hr|hours|hrs|day|days)\b/i
  );

  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    let deltaMs = 0;

    if (unit.startsWith("min")) {
      deltaMs = amount * 60 * 1000;
    } else if (unit.startsWith("hour") || unit.startsWith("hr")) {
      deltaMs = amount * 60 * 60 * 1000;
    } else if (unit.startsWith("day")) {
      deltaMs = amount * 24 * 60 * 60 * 1000;
    }

    const finalDueDate = referenceDate.getTime() + deltaMs;
    const targetWallClock = new Date(finalDueDate - offset * 60 * 1000);
    const targetH = targetWallClock.getUTCHours();
    const targetM = targetWallClock.getUTCMinutes();

    const dueDateLocal = formatToLocalDatetimeString(
      targetWallClock.getUTCFullYear(),
      targetWallClock.getUTCMonth(),
      targetWallClock.getUTCDate(),
      targetH,
      targetM
    );

    const title = cleanReminderTitle(rawText);

    return {
      isReminder: true,
      title,
      dueDate: finalDueDate,
      dueDateLocal,
      recurrenceMode,
      recurrenceDays,
      detectedTime: { hours: targetH, minutes: targetM },
    };
  }

  // Case 3b: "HH:MM am/pm" or "H:MM am/pm" or "H.MM am/pm"
  const timeWithMinutes12h = lower.match(
    /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.?|p\.m\.?)\b/i
  );

  if (timeWithMinutes12h) {
    let h = parseInt(timeWithMinutes12h[1], 10);
    const m = parseInt(timeWithMinutes12h[2], 10);
    const meridian = timeWithMinutes12h[3].toLowerCase().replace(/\./g, "");

    if (meridian === "pm" && h < 12) h += 12;
    if (meridian === "am" && h === 12) h = 0;

    extractedHours = h;
    extractedMinutes = m;
  }

  // Case 3c: "H am/pm" or "HH am/pm" (e.g. "5 pm", "10am", "at 9 PM", "3 p.m.")
  if (extractedHours === null) {
    const timeNoMinutes12h = lower.match(
      /\b(\d{1,2})\s*(am|pm|a\.m\.?|p\.m\.?)\b/i
    );

    if (timeNoMinutes12h) {
      let h = parseInt(timeNoMinutes12h[1], 10);
      const meridian = timeNoMinutes12h[2].toLowerCase().replace(/\./g, "");

      if (meridian === "pm" && h < 12) h += 12;
      if (meridian === "am" && h === 12) h = 0;

      extractedHours = h;
      extractedMinutes = 0;
    }
  }

  // Case 3d: "HH:MM" or "at HH:MM" 24h format (e.g. "17:00", "10:00", "at 16:30", "at 3:00")
  if (extractedHours === null) {
    const time24h = lower.match(
      /\b(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?!\s*(?:am|pm|a\.m|p\.m))\b/i
    );

    if (time24h) {
      let h = parseInt(time24h[1], 10);
      const m = parseInt(time24h[2], 10);

      // In business and personal speech, "at 1:00" through "at 7:00" defaults to PM unless "morning" is in text
      if (h >= 1 && h <= 7 && !lower.includes("morning") && !lower.includes("am")) {
        h += 12;
      }

      extractedHours = h;
      extractedMinutes = m;
    }
  }

  // Case 3e: "at H o'clock" (e.g. "at 5 o'clock", "at 7 o'clock pm")
  if (extractedHours === null) {
    const oclockMatch = lower.match(
      /\bat\s+(\d{1,2})\s*o'?clock(?:\s*(am|pm))?\b/i
    );

    if (oclockMatch) {
      let h = parseInt(oclockMatch[1], 10);
      const meridian = oclockMatch[2]?.toLowerCase();

      if (meridian === "pm" && h < 12) h += 12;
      if (meridian === "am" && h === 12) h = 0;

      if (!meridian) {
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

  // 4. Extract Target Day / Date using User's Wall-Clock Time
  let targetYear = userYear;
  let targetMonth = userMonth;
  let targetDay = userDay;
  let dayExplicitlyFound = false;

  if (lower.includes("day after tomorrow")) {
    const d = new Date(userWallClockDate);
    d.setUTCDate(d.getUTCDate() + 2);

    targetYear = d.getUTCFullYear();
    targetMonth = d.getUTCMonth();
    targetDay = d.getUTCDate();
    dayExplicitlyFound = true;
  } else if (lower.includes("tomorrow") || lower.includes("tmrw") || lower.includes("tom")) {
    const d = new Date(userWallClockDate);
    d.setUTCDate(d.getUTCDate() + 1);

    targetYear = d.getUTCFullYear();
    targetMonth = d.getUTCMonth();
    targetDay = d.getUTCDate();
    dayExplicitlyFound = true;
  } else if (lower.includes("today") || lower.includes("tonight")) {
    dayExplicitlyFound = true;
  } else {
    // Check for days of the week: "monday", "friday", "on saturday", etc.
    for (const [dayName, targetDayNum] of Object.entries(DAY_MAP)) {
      const dayRegex = new RegExp(
        `\\b(?:on\\s+|this\\s+|next\\s+)?${dayName}\\b`,
        "i"
      );

      if (dayRegex.test(lower)) {
        let daysUntil = (targetDayNum - userDayOfWeek + 7) % 7;

        if (daysUntil === 0) {
          if (extractedHours !== null) {
            const h = extractedHours;
            const m = extractedMinutes || 0;

            if (h < userHours || (h === userHours && m <= userMinutes)) {
              daysUntil = 7;
            }
          } else {
            daysUntil = 7;
          }
        }

        const d = new Date(userWallClockDate);
        d.setUTCDate(d.getUTCDate() + daysUntil);

        targetYear = d.getUTCFullYear();
        targetMonth = d.getUTCMonth();
        targetDay = d.getUTCDate();
        dayExplicitlyFound = true;
        break;
      }
    }

    // Check for specific date (e.g. "15th nov", "november 20", "nov 12", "5th of december", "26 november 2026")
    if (!dayExplicitlyFound) {
      for (const [monthName, monthIndex] of Object.entries(MONTH_MAP)) {
        const dateMatch =
          lower.match(
            new RegExp(
              `\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${monthName}(?:\\s+(\\d{4}))?\\b`,
              "i"
            )
          ) ||
          lower.match(
            new RegExp(
              `\\b(?:on\\s+)?${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`,
              "i"
            )
          );

        if (dateMatch) {
          const dayNum = parseInt(dateMatch[1], 10);
          const explicitYear = dateMatch[2] ? parseInt(dateMatch[2], 10) : undefined;

          targetMonth = monthIndex;
          targetDay = dayNum;
          targetYear = explicitYear !== undefined ? explicitYear : userYear;

          const candidateUtc =
            Date.UTC(
              targetYear,
              targetMonth,
              targetDay,
              extractedHours || 9,
              extractedMinutes || 0
            ) +
            offset * 60 * 1000;

          if (!explicitYear && candidateUtc < referenceDate.getTime() - 24 * 60 * 60 * 1000) {
            targetYear += 1;
          }

          dayExplicitlyFound = true;
          break;
        }
      }
    }
  }

  // 5. Combine Target Date with Target Time
  let finalHours = extractedHours;
  let finalMinutes = extractedMinutes || 0;

  if (extractedHours !== null) {
    if (!dayExplicitlyFound) {
      // If time has already passed today in user's timezone, move to tomorrow
      if (
        extractedHours < userHours ||
        (extractedHours === userHours && finalMinutes <= userMinutes)
      ) {
        const d = new Date(userWallClockDate);
        d.setUTCDate(d.getUTCDate() + 1);

        targetYear = d.getUTCFullYear();
        targetMonth = d.getUTCMonth();
        targetDay = d.getUTCDate();
      }
    }
  } else if (dayExplicitlyFound) {
    // Day mentioned, no time -> default to 9:00 AM on that day
    finalHours = 9;
    finalMinutes = 0;

    if (
      targetDay === userDay &&
      targetMonth === userMonth &&
      targetYear === userYear &&
      userHours >= 9
    ) {
      finalHours = userHours + 2;
      finalMinutes = userMinutes;

      if (finalHours >= 24) {
        finalHours -= 24;

        const d = new Date(userWallClockDate);
        d.setUTCDate(d.getUTCDate() + 1);

        targetYear = d.getUTCFullYear();
        targetMonth = d.getUTCMonth();
        targetDay = d.getUTCDate();
      }
    }
  } else if (isReminder) {
    // General reminder with no time or day -> +2 hours from now
    const targetUtcMs = referenceDate.getTime() + 2 * 60 * 60 * 1000;
    const targetWallClock = new Date(targetUtcMs - offset * 60 * 1000);

    targetYear = targetWallClock.getUTCFullYear();
    targetMonth = targetWallClock.getUTCMonth();
    targetDay = targetWallClock.getUTCDate();
    finalHours = targetWallClock.getUTCHours();
    finalMinutes = targetWallClock.getUTCMinutes();
  }

  let finalDueDate: number | undefined = undefined;
  let dueDateLocal: string | undefined = undefined;

  // Only attach a due date when the input has been classified as a reminder.
  if (isReminder && finalHours !== null) {
    finalDueDate =
      Date.UTC(targetYear, targetMonth, targetDay, finalHours, finalMinutes, 0, 0) +
      offset * 60 * 1000;

    dueDateLocal = formatToLocalDatetimeString(
      targetYear,
      targetMonth,
      targetDay,
      finalHours,
      finalMinutes
    );
  }

  const title = cleanReminderTitle(rawText);

  return {
    isReminder,
    title,
    dueDate: finalDueDate,
    dueDateLocal,
    recurrenceMode,
    recurrenceDays,
    detectedTime:
      finalHours !== null ? { hours: finalHours, minutes: finalMinutes } : undefined,
  };
}

/**
 * Generates a short, actionable title (2-5 words) from a reminder sentence.
 * Strips "I have to", "I need to", "Remind me to", etc., and removes date/time suffixes.
 * Example: "I have to call John tomorrow at 5 PM." -> "Call John"
 */
export function cleanReminderTitle(rawText: string): string {
  let cleaned = rawText.trim();

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.?!]+$/, "").trim();

  // Strip prefixes
  cleaned = cleaned
    .replace(/\bp\.m\.?/gi, "pm")
    .replace(/\ba\.m\.?/gi, "am")
    .replace(/^(?:(?:in|for|to|at)\s+(?:the\s+)?(?:team\s+)?[\w\s-]{1,30}\s*[,:]\s*(?!\d{2})|[a-zA-Z][\w\s-]{0,29}\s*:\s*(?!\d{2}))/i, "")
    .replace(/^(?:(?:today|tomorrow)\s+)?(?:i|we)\s+(?:will|shall|have\s+to|need\s+to|must|should|gotta|got\s+to|am\s+going\s+to|'ll)\s+/i, "")
    .replace(/^(?:tomorrow\s+|today\s+|tonight\s+)?(?:i\s+have\s+(?:an?\s+)?|i\s+got\s+(?:an?\s+)?)/i, "")
    .replace(/^(?:i\s+have\s+to|i\s+need\s+to|i\s+must|i\s+should)\s+/i, "")
    .replace(/^(?:please\s+)?remind\s+me\s+(?:to\s+|about\s+|that\s+)?/i, "")
    .replace(/^set\s+a\s+reminder\s+(?:for\s+|to\s+)?/i, "")
    .replace(/^reminder\s*:\s*/i, "")
    .replace(/^create\s+a\s+reminder\s+(?:for\s+|to\s+)?/i, "")
    .replace(/^schedule\s+(?:a\s+)?(?:meeting\s+with\s+|appointment\s+with\s+)?/i, "")
    .trim();

  // Strip date & time suffixes from the title so title is a concise action
  // (e.g. "Call John", "Important Meeting")
  cleaned = cleaned
    .replace(/\s+(?:tomorrow|today|tonight)(?:\s+at\s+.*)?$/i, "")
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.?|p\.m\.?).*$/i, "")
    .replace(/\s+at\s+\d{1,2}:\d{2}.*$/i, "")
    .replace(/\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+.*)?$/i, "")
    .replace(/\s+(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?)(?:\s+\d{4})?(?:\s+at\s+.*)?$/i, "")
    .replace(/\s+(?:in|after)\s+\d+\s*(?:minute|min|hour|hr|day)s?.*$/i, "")
    .replace(/\s+daily(?:\s+at\s+.*)?$/i, "")
    .replace(/\s+every\s+day(?:\s+at\s+.*)?$/i, "")
    .replace(/[.?!]+$/, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length > 5) {
    cleaned = words.slice(0, 4).join(" ");
  }

  if (!cleaned) cleaned = "Reminder";

  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Cleans the content of a reminder to clearly state what the user needs to do,
 * preserving all important details and deadlines.
 * Example: "I have to call John tomorrow at 5 PM." -> "Call John tomorrow at 5:00 PM."
 */
export function cleanReminderContent(rawText: string): string {
  let cleaned = rawText.trim();

  cleaned = cleaned
    .replace(/^(?:(?:in|for|to|at)\s+(?:the\s+)?(?:team\s+)?[\w\s-]{1,30}\s*[,:]\s*(?!\d{2})|[a-zA-Z][\w\s-]{0,29}\s*:\s*(?!\d{2}))/i, "")
    .replace(/^(?:(?:today|tomorrow)\s+)?(?:i|we)\s+(?:will|shall|have\s+to|need\s+to|must|should|gotta|got\s+to|am\s+going\s+to|'ll)\s+/i, "")
    .replace(/^(?:i\s+have\s+to|i\s+need\s+to|i\s+must)\s+/i, "")
    .replace(/^(?:please\s+)?remind\s+me\s+(?:to\s+|about\s+|that\s+)?/i, "")
    .replace(/^set\s+a\s+reminder\s+(?:for\s+|to\s+)?/i, "")
    .replace(/^reminder\s*:\s*/i, "")
    .trim();

  if (!cleaned) cleaned = rawText.trim();

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Generates a distinct title and content for checklist/lists.
 * Never duplicates items in title.
 * Example: "Buy milk, bread and eggs" -> Title: "Grocery Shopping", Content: "Shopping items to purchase."
 */
export function generateSmartListInfo(rawText: string): {
  title: string;
  content: string;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
} {
  const lower = rawText.toLowerCase();

  const items = splitChecklistItems(rawText);

  let title = "Checklist";
  let content = "Checklist of items.";

  if (
    lower.includes("bathroom") ||
    lower.includes("toilet") ||
    lower.includes("toiletries")
  ) {
    title = "Bathroom Supplies";
    content = "Bathroom supplies and toiletries to get.";
  } else if (
    lower.includes("gym") ||
    lower.includes("workout") ||
    lower.includes("exercise") ||
    lower.includes("sports shoes")
  ) {
    title = "Gym Essentials";
    content = "Items to pack for the gym.";
  } else if (
    lower.includes("vacation") ||
    lower.includes("pack") ||
    lower.includes("luggage") ||
    lower.includes("trip") ||
    lower.includes("travel") ||
    (lower.includes("shirt") && lower.includes("jean"))
  ) {
    title = "Packing List";
    content = "Items to pack for the trip.";
  } else if (
    lower.includes("school") ||
    (lower.includes("notebook") && (lower.includes("pen") || lower.includes("pencil")))
  ) {
    title = "School Supplies";
    content = "School supplies and stationery to get.";
  } else if (
    lower.includes("clean") ||
    lower.includes("broom") ||
    lower.includes("floor cleaner") ||
    lower.includes("detergent") ||
    lower.includes("garbage bag") ||
    lower.includes("mop") ||
    lower.includes("household")
  ) {
    title = "Cleaning Supplies";
    content = "Cleaning items and supplies to get.";
  } else if (
    lower.includes("party") ||
    lower.includes("birthday") ||
    lower.includes("balloon") ||
    lower.includes("candle") ||
    lower.includes("celebration")
  ) {
    title = "Party Supplies";
    content = "Party supplies and items to get.";
  } else if (
    lower.includes("bedsheet") ||
    lower.includes("pillow") ||
    lower.includes("curtain") ||
    lower.includes("dustbin")
  ) {
    title = "Room Essentials";
    content = "Items to buy for the room.";
  } else if (
    lower.includes("way to") ||
    lower.includes("repair") ||
    lower.includes("documents") ||
    lower.includes("errand") ||
    (lower.includes("office") && (lower.includes("drop") || lower.includes("parcel") || lower.includes("collect")))
  ) {
    title = "Daily Errands";
    content = "Errands and tasks to complete.";
  } else if (
    lower.includes("pharmacy") ||
    lower.includes("medicine") ||
    lower.includes("parcel")
  ) {
    title = "Errands & Shopping";
    content = "Errands and items to pick up.";
  } else if (
    lower.includes("dinner") ||
    lower.includes("lunch") ||
    lower.includes("paneer") ||
    lower.includes("spices") ||
    lower.includes("cream") ||
    lower.includes("milk") ||
    lower.includes("bread") ||
    lower.includes("egg") ||
    lower.includes("grocery") ||
    lower.includes("groceries") ||
    lower.includes("fruit") ||
    lower.includes("vegetable") ||
    lower.includes("buy ") ||
    lower.includes("supermarket") ||
    lower.includes("market") ||
    lower.includes("apple") ||
    lower.includes("soap") ||
    lower.includes("shampoo") ||
    lower.includes("toothpaste") ||
    lower.includes("produce") ||
    lower.includes("macaroni") ||
    lower.includes("cheese") ||
    lower.includes("biscuit") ||
    lower.includes("rice") ||
    lower.includes("flour") ||
    lower.includes("oil") ||
    lower.includes("salt") ||
    lower.includes("tea")
  ) {
    title = "Grocery Shopping";
    content = "Shopping items to purchase.";
  } else if (
    lower.includes("office") ||
    lower.includes("stationery")
  ) {
    title = "Office Supplies";
    content = "Office supplies and items to get.";
  } else if (
    lower.includes("todo") ||
    lower.includes("to-do") ||
    lower.includes("task") ||
    lower.includes("work")
  ) {
    title = "To-Do List";
    content = "Tasks to complete.";
  } else {
    title = "Shopping List";
    content = "Items to get.";
  }

  const checklist =
    items.length > 0
      ? items.map((cleanedItem, idx) => ({
          id: (idx + 1).toString(),
          text: cleanedItem,
          completed: false,
        }))
      : (() => {
          const single = cleanChecklistItem(rawText);
          return single
            ? [
                {
                  id: "1",
                  text: single,
                  completed: false,
                },
              ]
            : [];
        })();

  return { title, content, checklist };
}

/**
 * Generates a short, meaningful title (2-5 words) summarizing note subject,
 * with complete details in content.
 */
export function generateSmartNoteInfo(rawText: string): {
  title: string;
  content: string;
} {
  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  const cleanedSubject = trimmed
    .replace(/^(?:today\s+i\s+learned\s+(?:about|something\s+interesting\s+about|something\s+about)?|i\s+learned\s+(?:about|something\s+about)?)\s+/i, "")
    .replace(/^(?:today\s+i\s+discussed|i\s+discussed|we\s+discussed|discussion\s+about)\s+/i, "")
    .replace(/^(?:i\s+was\s+thinking\s+about|thought\s+about|idea\s+about|note\s+about)\s+/i, "")
    .replace(/^(?:today\s+|yesterday\s+|meeting\s+about\s+|note\s*:\s*)/i, "")
    .replace(/[.,;!?]+$/, "")
    .trim();

  const words = cleanedSubject.split(/\s+/).filter(Boolean);
  let title = "General Note";

  if (words.length >= 2) {
    title = words
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } else if (words.length === 1) {
    title = words[0].charAt(0).toUpperCase() + words[0].slice(1) + " Note";
  }

  let content = trimmed;
  if (lower.startsWith("today i discussed ")) {
    content = "Discussed " + trimmed.slice(18);
  }

  return { title, content };
}

/**
 * Detects and parses multiple separate reminders from a single sentence or text input.
 * Supports natural connecting words like "then", "and then", "after that", "also", "and also",
 * semicolons, newlines, and multi-time expressions.
 *
 * Example:
 * "Call my friend at 11:05 AM then I have to go to the market at 1:00 PM then I have to go for a walk at 7:30 PM."
 * Returns 3 separate parsed reminders with their distinct times and titles.
 */
export function parseMultipleReminders(
  rawText: string,
  referenceDate: Date = new Date(),
  clientTimezoneOffset?: number
): ParsedNaturalReminder[] | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Split on natural task transition boundaries:
  // - "then", "and then", "after that", "and after that"
  // - "and also", "also" (when followed by a verb/action or "i have to/i need to")
  // - Semicolons ";" or newlines "\n"
  const splitPattern =
    /(?:,\s*(?:and\s+)?then\s+|\s+(?:and\s+)?then\s+|\s+(?:and\s+)?after\s+that\s+|\s+and\s+also\s+|;\s*|\n+)/i;

  let segments = trimmed.split(splitPattern).map((s) => s.trim()).filter(Boolean);

  // If segments <= 1, check for clauses separated by ", and " or " and " when multiple tasks/actions are mentioned
  if (segments.length <= 1) {
    const boundaryRegex =
      /(?:,\s*(?:and\s+)?|\s+and\s+)(?=(?:(?:i\s+(?:will|have\s+to|need\s+to|must|should|got\s+to|gotta|am\s+going\s+to|'ll)|please\s+)?(?:call|phone|ring|pay|submit|attend|meet|send|email|buy|pick\s+up|clean|wash|take|drink|check|finish|complete|wake|visit|drop|collect|deliver|post|write|order|renew|cancel|book|schedule|remind|go|head|walk|run|exercise|workout|gym|study|read|cook|eat|sleep|start|leave|get|shop))\b)/i;

    const candidateSegments = trimmed.split(boundaryRegex).map((s) => s.trim()).filter(Boolean);
    if (candidateSegments.length >= 2) {
      segments = candidateSegments;
    }
  }

  if (segments.length <= 1) {
    return null;
  }

  const parsedReminders: ParsedNaturalReminder[] = [];

  for (const seg of segments) {
    const parsed = parseNaturalReminder(seg, referenceDate, clientTimezoneOffset);

    // Each segment must qualify as a reminder or have a detectable scheduled time/day
    if (parsed.isReminder || parsed.dueDate || parsed.detectedTime) {
      let finalDueDate = parsed.dueDate;
      let finalDueDateLocal = parsed.dueDateLocal;

      if (!finalDueDate && parsed.detectedTime) {
        const offset =
          clientTimezoneOffset !== undefined
            ? clientTimezoneOffset
            : typeof window !== "undefined"
              ? new Date().getTimezoneOffset()
              : 0;

        const d = new Date(referenceDate.getTime() - offset * 60 * 1000);
        const h = parsed.detectedTime.hours;
        const m = parsed.detectedTime.minutes;

        if (h < d.getUTCHours() || (h === d.getUTCHours() && m <= d.getUTCMinutes())) {
          d.setUTCDate(d.getUTCDate() + 1);
        }

        finalDueDate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) + offset * 60 * 1000;
        finalDueDateLocal =
          d.getUTCFullYear() +
          "-" +
          String(d.getUTCMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getUTCDate()).padStart(2, "0") +
          "T" +
          String(h).padStart(2, "0") +
          ":" +
          String(m).padStart(2, "0");
      }

      parsedReminders.push({
        ...parsed,
        isReminder: true,
        dueDate: finalDueDate,
        dueDateLocal: finalDueDateLocal,
        title: parsed.title || cleanReminderTitle(seg),
      });
    }
  }

  // Only return as multiple reminders if at least 2 distinct reminders were detected
  if (parsedReminders.length >= 2) {
    return parsedReminders;
  }

  return null;
}
