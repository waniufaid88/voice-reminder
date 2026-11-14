import { NextRequest, NextResponse } from "next/server";
import {
  parseNaturalReminder,
  cleanReminderContent,
  generateSmartListInfo,
  generateSmartNoteInfo,
} from "@/lib/natural-date-parser";
import { parseLocalDatetime } from "@/lib/date-utils";

/**
 * Normalizes audio MIME types and file extensions for OpenAI Whisper compatibility.
 * Strips codecs parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm") which cause
 * OpenAI Whisper to reject mobile audio uploads with HTTP 400 Bad Request.
 */
function getWhisperMimeAndExt(
  rawMime: string,
  originalName?: string
): { mime: string; ext: string } {
  const baseMime = (rawMime || "").split(";")[0].trim().toLowerCase();
  const name = (originalName || "").toLowerCase();

  if (
    baseMime.includes("mp4") ||
    baseMime.includes("m4a") ||
    name.endsWith(".mp4") ||
    name.endsWith(".m4a")
  ) {
    return { mime: "audio/mp4", ext: "recording.mp4" };
  }
  if (baseMime.includes("ogg") || name.endsWith(".ogg")) {
    return { mime: "audio/ogg", ext: "recording.ogg" };
  }
  if (baseMime.includes("wav") || name.endsWith(".wav")) {
    return { mime: "audio/wav", ext: "recording.wav" };
  }
  if (
    baseMime.includes("mpeg") ||
    baseMime.includes("mp3") ||
    name.endsWith(".mp3")
  ) {
    return { mime: "audio/mpeg", ext: "recording.mp3" };
  }
  if (baseMime.includes("aac") || name.endsWith(".aac")) {
    return { mime: "audio/aac", ext: "recording.aac" };
  }
  if (baseMime.includes("flac") || name.endsWith(".flac")) {
    return { mime: "audio/flac", ext: "recording.flac" };
  }
  // Standard fallback for Android Chrome MediaRecorder (audio/webm, video/webm, etc.)
  return { mime: "audio/webm", ext: "recording.webm" };
}

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
      content: cleanReminderContent(rawText),
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
  const isList =
    lower.includes("buy ") ||
    lower.includes("list") ||
    lower.includes("groceries") ||
    lower.includes("shopping") ||
    lower.includes("todo") ||
    rawText.includes(",") ||
    rawText.includes(" and ");

  if (isList) {
    const listInfo = generateSmartListInfo(rawText);
    return {
      type: "list" as const,
      title: listInfo.title,
      content: listInfo.content,
      dueDate: undefined,
      checklist: listInfo.checklist,
      tags: ["#list", "#shopping"],
    };
  }

  // Default to Note
  const noteInfo = generateSmartNoteInfo(rawText);
  return {
    type: "note" as const,
    title: noteInfo.title,
    content: noteInfo.content,
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
          const { mime: cleanMime, ext: cleanExt } = getWhisperMimeAndExt(
            audioFile.type,
            (audioFile as File).name
          );

          const arrayBuffer = await audioFile.arrayBuffer();
          const audioBytes = new Uint8Array(arrayBuffer);
          const fileToUpload = new File([audioBytes], cleanExt, { type: cleanMime });

          whisperFormData.append("file", fileToUpload);
          whisperFormData.append("model", "whisper-1");
          whisperFormData.append("response_format", "json");
          whisperFormData.append("prompt", "Voice reminder, meeting, appointment, checklist, grocery list, task, note.");

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
            const whisperText = (whisperData.text || "").trim();
            // Filter common Whisper silence hallucinations on mobile recordings
            const isHallucination =
              /^(?:thanks for watching|thank you for watching|subscribe|you|bye|\.)\.?$/i.test(whisperText);

            if (whisperText && !isHallucination) {
              rawText = whisperText;
            } else if (fallbackText) {
              rawText = fallbackText;
            }
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
    } else if (
      rawText.trim().length < 4 &&
      fallbackText.trim().length > rawText.trim().length
    ) {
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
1. "note": General thought, idea, journal, or informational summary without any deadline, scheduled time, or future action.
2. "reminder": Any task, meeting, appointment, deadline, scheduled time, or future action (e.g. "Tomorrow I have an important meeting at 3:00 p.m." MUST be categorized as "reminder").
3. "list": A checklist of multiple actionable items, groceries, or todo steps.

CRITICAL USER TIMEZONE CONTEXT:
- User's Current Local Time: ${userLocalString}
- User's Timezone: ${userTz}
- Today in user's timezone is: ${todayDayName}, ${todayDateStr}
- Tomorrow in user's timezone is: ${tomorrowDayName}, ${tomorrowDateStr}

CRITICAL TITLE AND CONTENT RULES (MANDATORY):
The title and content MUST be completely different. Never use the complete original user sentence as the title.

1. NOTES:
- Generate a short, meaningful title (2-5 words) summarizing the main subject (e.g. "Project Discussion", "App Architecture", "Book Recommendation").
- Content should contain the complete note with its important details in well-written prose.
Example:
Input: "Today I discussed the new project with my team. We decided to finish it by Friday."
Title: "Project Discussion"
Content: "Discussed the new project with the team. The agreed deadline is Friday."

2. REMINDERS:
- Generate a short, actionable title (2-5 words).
- Do NOT include unnecessary phrases like "I have to", "I need to", "I must", or "Remind me".
- Never put the date/time inside the title if the title already explains the action (e.g. use "Call John", not "Call John Tomorrow at 5 PM").
- Content should clearly explain what the user needs to do, preserving all important details and deadlines.
Example:
Input: "I have to call John tomorrow at 5 PM."
Title: "Call John"
Content: "Call John tomorrow at 5:00 PM."

3. LISTS:
- Generate a meaningful title describing the list (e.g. "Grocery Shopping", "Packing Checklist", "Weekly Tasks").
- Content should briefly describe the purpose of the list (e.g. "Shopping items to purchase.").
- Put individual items inside the checklist array (e.g. "Milk", "Bread", "Eggs").
- NEVER duplicate checklist items inside the title.
Example:
Input: "Buy milk, bread and eggs."
Title: "Grocery Shopping"
Content: "Shopping items to purchase."
Checklist:
- Milk
- Bread
- Eggs

Rules for reminder scheduling:
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
  "title": "Short descriptive title (2-5 words)",
  "content": "Detailed, well-punctuated transcript or summary (different from title)",
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

          // If GPT didn't provide a valid dueDate or if natural parser found a specific date/time fallback
          if (!finalDueDate && natural.dueDate) {
            finalDueDate = natural.dueDate;
            dueDateLocal = natural.dueDateLocal;
          }

          const recurrenceMode =
            parsed.recurrenceMode || natural.recurrenceMode || "once";
          const recurrenceDays =
            parsed.recurrenceDays || natural.recurrenceDays;

          // Categorization enforcement:
          // 1. Any item with a detected due date/time or reminder intent is strictly a reminder
          // 2. Any item with a checklist or list intent is strictly a list
          // 3. Otherwise note
          let finalType: "note" | "reminder" | "list" = parsed.type;
          if (
            finalDueDate ||
            natural.dueDate ||
            natural.isReminder ||
            parsed.type === "reminder"
          ) {
            finalType = "reminder";
          } else if (
            (parsed.checklist && parsed.checklist.length > 0) ||
            parsed.type === "list"
          ) {
            finalType = "list";
          } else if (!finalType) {
            finalType = "note";
          }
          let finalTitle = parsed.title?.trim() || "";
          let finalContent = parsed.content?.trim() || "";

          // Ensure title and content are strictly distinct and title is concise
          if (
            !finalTitle ||
            finalTitle.toLowerCase() === finalContent.toLowerCase() ||
            finalTitle.split(/\s+/).length > 6
          ) {
            if (finalType === "reminder") {
              finalTitle = natural.title;
              if (!finalContent || finalContent.toLowerCase() === finalTitle.toLowerCase()) {
                finalContent = cleanReminderContent(rawText);
              }
            } else if (finalType === "list") {
              const listInfo = generateSmartListInfo(rawText);
              finalTitle = listInfo.title;
              if (!finalContent || finalContent.toLowerCase() === finalTitle.toLowerCase()) {
                finalContent = listInfo.content;
              }
            } else {
              const noteInfo = generateSmartNoteInfo(rawText);
              finalTitle = noteInfo.title;
              if (!finalContent || finalContent.toLowerCase() === finalTitle.toLowerCase()) {
                finalContent = noteInfo.content;
              }
            }
          }

          return NextResponse.json({
            success: true,
            usedOpenAI: true,
            rawTranscript: rawText,
            type: finalType,
            title: finalTitle,
            content: finalContent || rawText,
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
