import { NextRequest, NextResponse } from "next/server";
import { parseNaturalReminder } from "@/lib/natural-date-parser";
import { parseLocalDatetime } from "@/lib/date-utils";

// Intelligent rule-based extractor with full natural date, time, and recurrence support
function parseTextRuleBased(
  rawText: string,
  refDate: Date = new Date(),
  clientTimezoneOffset?: number
) {
  const natural = parseNaturalReminder(rawText, refDate, clientTimezoneOffset);

  if (natural.isReminder) {
    return {
      type: "reminder" as const,
      title: natural.title,
      content: rawText,
      dueDate: natural.dueDate,
      dueDateLocal: natural.dueDateLocal,
      recurrenceMode: natural.recurrenceMode || "once",
      recurrenceDays: natural.recurrenceDays,
      isDaily: natural.recurrenceMode === "daily",
      checklist: undefined,
      tags: [
        "#reminder",
        natural.recurrenceMode === "daily" ? "#daily" : "#task",
      ],
    };
  }

  const lower = rawText.toLowerCase().trim();
  const words = rawText.trim().split(/\s+/);
  const title = words.slice(0, 6).join(" ") || "Note";

  const isList =
    lower.includes("buy ") ||
    lower.includes("list") ||
    lower.includes("groceries") ||
    lower.includes("shopping") ||
    lower.includes("todo") ||
    rawText.includes(",") ||
    rawText.includes(" and ");

  if (isList) {
    const rawItems = rawText
      .replace(/^.*(?:buy|list|get)\s+/i, "")
      .split(/,|\band\b|\n/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const checklist =
      rawItems.length > 0
        ? rawItems.map((text, idx) => ({
            id: (idx + 1).toString(),
            text: text.charAt(0).toUpperCase() + text.slice(1),
            completed: false,
          }))
        : [{ id: "1", text: rawText, completed: false }];

    return {
      type: "list" as const,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      content: rawText,
      dueDate: undefined,
      checklist,
      tags: ["#list", "#shopping"],
    };
  }

  // Default to Note
  return {
    type: "note" as const,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    content: rawText,
    dueDate: undefined,
    checklist: undefined,
    tags: ["#note", "#voice"],
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const contentType = req.headers.get("content-type") || "";

  let rawText = "";
  let fallbackText = "";
  let clientTimezone = "";
  let clientTimezoneOffset: number | undefined = undefined;
  let clientNowISO = "";
  let clientNowLocal = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as Blob | null;
      fallbackText = (formData.get("fallbackText") as string) || "";
      clientTimezone = (formData.get("clientTimezone") as string) || "";
      clientNowISO = (formData.get("clientNowISO") as string) || "";
      clientNowLocal = (formData.get("clientNowLocal") as string) || "";

      const offsetRaw = formData.get("clientTimezoneOffset");
      if (offsetRaw !== null && offsetRaw !== undefined && offsetRaw !== "") {
        const parsedOffset = parseInt(offsetRaw as string, 10);
        if (!isNaN(parsedOffset)) clientTimezoneOffset = parsedOffset;
      }

      if (audioFile && apiKey) {
        // Step 1: Send audio to OpenAI Whisper API
        try {
          const whisperFormData = new FormData();
          whisperFormData.append("file", audioFile, "recording.webm");
          whisperFormData.append("model", "whisper-1");
          whisperFormData.append("response_format", "json");

          const whisperRes = await fetch(
            "https://api.openai.com/v1/audio/transcriptions",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}` },
              body: whisperFormData,
            }
          );

          if (whisperRes.ok) {
            const whisperData = await whisperRes.json();
            rawText = whisperData.text || "";
          } else {
            const errJson = await whisperRes.json().catch(() => ({}));
            console.warn("Whisper API error:", errJson);
            if (fallbackText) rawText = fallbackText;
          }
        } catch (whisperErr) {
          console.warn("Whisper request failed:", whisperErr);
          if (fallbackText) rawText = fallbackText;
        }
      } else if (fallbackText) {
        rawText = fallbackText;
      }
    } else {
      // Direct text input
      const json = await req.json();
      rawText = json.text || "";
      clientTimezone = json.clientTimezone || "";
      clientNowISO = json.clientNowISO || "";
      clientNowLocal = json.clientNowLocal || "";
      if (json.clientTimezoneOffset !== undefined && json.clientTimezoneOffset !== null) {
        const parsedOffset = Number(json.clientTimezoneOffset);
        if (!isNaN(parsedOffset)) clientTimezoneOffset = parsedOffset;
      }
    }

    if (!rawText.trim() && fallbackText.trim()) {
      rawText = fallbackText.trim();
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        {
          error:
            "No voice could be transcribed. Please speak clearly or check microphone permissions.",
        },
        { status: 400 }
      );
    }

    const refDate = clientNowISO ? new Date(clientNowISO) : new Date();

    // Step 2: Extract with deterministic natural parser using client's exact timezone offset
    const natural = parseNaturalReminder(rawText, refDate, clientTimezoneOffset);

    // Step 3: Structure with GPT-4o-mini if API key is present
    if (apiKey) {
      try {
        const userLocalString = clientNowLocal || refDate.toLocaleString();
        const userTz = clientTimezone || "User Local Time";

        // Calculate wall-clock date in user's timezone for accurate prompt context
        const userWallClock =
          clientTimezoneOffset !== undefined
            ? new Date(refDate.getTime() - clientTimezoneOffset * 60 * 1000)
            : refDate;

        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

        const todayDayName = dayNames[userWallClock.getUTCDay()];
        const todayDateStr = `${monthNames[userWallClock.getUTCMonth()]} ${userWallClock.getUTCDate()}, ${userWallClock.getUTCFullYear()}`;

        const tomorrowWallClock = new Date(userWallClock.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowDayName = dayNames[tomorrowWallClock.getUTCDay()];
        const tomorrowDateStr = `${monthNames[tomorrowWallClock.getUTCMonth()]} ${tomorrowWallClock.getUTCDate()}, ${tomorrowWallClock.getUTCFullYear()}`;

        const systemPrompt = `You are an intelligent assistant that categorizes raw user thoughts/voice transcriptions into one of three formats:
1. "note": General thought, meeting note, idea, journal, or informational summary.
2. "reminder": A task with a specific deadline, due date, scheduled time, or future action.
3. "list": A checklist of multiple actionable items, groceries, or todo steps.

CRITICAL USER TIMEZONE CONTEXT:
- User's Current Local Time: ${userLocalString}
- User's Timezone: ${userTz}
- Today in user's timezone is: ${todayDayName}, ${todayDateStr}
- Tomorrow in user's timezone is: ${tomorrowDayName}, ${tomorrowDateStr}

Rules for reminders:
- You MUST extract the EXACT time and day specified by the user (e.g. "4:30 pm" -> 16:30, "at 10 am" -> 10:00, "tomorrow at 5 pm" -> tomorrow at 17:00, "on Friday at 2 pm" -> upcoming Friday at 14:00).
- If only a time is mentioned (e.g. "at 5 pm"): if that time today is in the future in the user's timezone, set for today; if that time has already passed today, set for tomorrow.
- Output "dueDateLocal" formatted strictly as "YYYY-MM-DDTHH:mm" (24-hour format in USER'S local time).
- If recurrence is mentioned:
  - "daily", "every day", "everyday" -> "recurrenceMode": "daily"
  - "every weekday" -> "recurrenceMode": "custom", "recurrenceDays": [1,2,3,4,5]
  - "every weekend" -> "recurrenceMode": "custom", "recurrenceDays": [0,6]
  - specific days (e.g. "every monday and friday") -> "recurrenceMode": "custom", "recurrenceDays": [0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat]
  - otherwise "recurrenceMode": "once"

Respond ONLY with valid JSON with this exact structure:
{
  "type": "note" | "reminder" | "list",
  "title": "Short descriptive title (3-6 words)",
  "content": "Cleaned up, well-punctuated transcript or summary",
  "dueDateLocal": "YYYY-MM-DDTHH:mm" or null,
  "recurrenceMode": "once" | "daily" | "custom",
  "recurrenceDays": [1, 3] or null,
  "checklist": [
    { "id": "1", "text": "item description", "completed": false }
  ],
  "tags": ["#tag1", "#tag2"]
}`;

        const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Please structure this input:\n"${rawText}"` },
            ],
            temperature: 0.2,
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const parsed = JSON.parse(gptData.choices[0].message.content);

          let finalDueDate: number | undefined = undefined;
          let dueDateLocal = parsed.dueDateLocal || natural.dueDateLocal;

          if (parsed.dueDateLocal) {
            finalDueDate = parseLocalDatetime(parsed.dueDateLocal, clientTimezoneOffset);
          }

          // If user specified an explicit time/day, prioritize natural parser's exact offset calculation
          if (natural.dueDate && (!finalDueDate || natural.detectedTime)) {
            finalDueDate = natural.dueDate;
            dueDateLocal = natural.dueDateLocal;
            if (parsed.type !== "reminder") parsed.type = "reminder";
          }

          const recurrenceMode =
            parsed.recurrenceMode || natural.recurrenceMode || "once";
          const recurrenceDays =
            parsed.recurrenceDays || natural.recurrenceDays;

          return NextResponse.json({
            success: true,
            usedOpenAI: true,
            rawTranscript: rawText,
            type: parsed.type || (natural.isReminder ? "reminder" : "note"),
            title: parsed.title || natural.title,
            content: parsed.content || rawText,
            dueDate: finalDueDate,
            dueDateLocal,
            recurrenceMode,
            recurrenceDays,
            isDaily: recurrenceMode === "daily",
            checklist: parsed.checklist,
            tags: parsed.tags || ["#voice"],
          });
        }
      } catch (gptErr) {
        console.warn("GPT structuring error:", gptErr);
      }
    }

    // Fallback: Accurate rule-based structuring using natural date parser with timezone offset
    const structured = parseTextRuleBased(rawText, refDate, clientTimezoneOffset);
    return NextResponse.json({
      success: true,
      usedOpenAI: false,
      isQuotaExhausted: true,
      rawTranscript: rawText,
      ...structured,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to process audio/text.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
