import { NextRequest, NextResponse } from "next/server";
import {
  parseNaturalReminder,
  parseMultipleReminders,
  cleanReminderTitle,
  cleanReminderContent,
  generateSmartListInfo,
  generateSmartNoteInfo,
} from "@/lib/natural-date-parser";
import { parseLocalDatetime } from "@/lib/date-utils";

const GROQ_API_URL = "https://api.groq.com/openai/v1";
const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";

/**
 * Normalize audio MIME types and extensions for Groq transcription.
 */
function getGroqMimeAndExt(
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

  // Android Chrome commonly records WebM/Opus.
  return { mime: "audio/webm", ext: "recording.webm" };
}

/**
 * Detect explicit list-creation or list-management intent.
 *
 * Commas and the word "and" do not automatically mean a list.
 */
function hasExplicitListIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim();

  // Direct shopping or purchasing instructions.
  if (/^(?:please\s+)?(?:buy|purchase|pick up)\b/.test(text)) {
    return true;
  }

  // Explicitly create or prepare a list/checklist.
  if (
    /\b(?:make|create|prepare|start)\s+(?:(?:a|an)\s+)?(?:(?:shopping|grocery|packing|todo|to-do|task)\s+)?(?:list|checklist)\b/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /\b(?:make|create|prepare)\s+(?:a\s+)?list\s+of\b/.test(text)
  ) {
    return true;
  }

  // Add items to an existing list.
  if (
    /\b(?:add|put|include)\b.*\b(?:to|in|on)\s+(?:(?:my|the)\s+)?(?:(?:shopping|grocery|packing|todo|to-do|task)\s+)?(?:list|checklist)\b/.test(
      text
    )
  ) {
    return true;
  }

  if (
    /\b(?:make|create|prepare)\s+(?:me\s+)?(?:a\s+)?checklist\b/.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Rule-based fallback when Groq chat is unavailable.
 *
 * Priority:
 * 1. Reminder
 * 2. Explicit list
 * 3. Note
 */
function parseTextRuleBased(
  rawText: string,
  refDate: Date = new Date(),
  clientTimezoneOffset?: number
) {
  // Explicit checklist or shopping intent is never split into multiple reminders
  if (hasExplicitListIntent(rawText)) {
    const listInfo = generateSmartListInfo(rawText);
    const listItem = {
      type: "list" as const,
      title: listInfo.title,
      content: listInfo.content,
      dueDate: undefined,
      dueDateLocal: undefined,
      recurrenceMode: "once" as const,
      recurrenceDays: undefined,
      isDaily: false,
      checklist: listInfo.checklist,
      tags: ["#list", "#shopping"],
    };
    return {
      ...listItem,
      items: [listItem],
    };
  }

  // Check for multiple distinct reminders (e.g. joined by "then", "and then", "after that", etc.)
  const multi = parseMultipleReminders(rawText, refDate, clientTimezoneOffset);
  if (multi && multi.length > 1) {
    const formattedItems = multi.map((m) => {
      const isDaily = m.recurrenceMode === "daily";
      return {
        type: "reminder" as const,
        title: m.title || "Reminder",
        content: cleanReminderContent(
          m.title + (m.dueDateLocal ? ` scheduled for ${m.dueDateLocal}` : "")
        ),
        dueDate: m.dueDate,
        dueDateLocal: m.dueDateLocal,
        recurrenceMode: m.recurrenceMode || "once",
        recurrenceDays: m.recurrenceDays,
        isDaily,
        checklist: undefined,
        tags: ["#reminder", isDaily ? "#daily" : "#task"],
      };
    });

    return {
      type: "reminder" as const,
      title: formattedItems[0].title,
      content: cleanReminderContent(rawText),
      dueDate: formattedItems[0].dueDate,
      dueDateLocal: formattedItems[0].dueDateLocal,
      recurrenceMode: formattedItems[0].recurrenceMode,
      recurrenceDays: formattedItems[0].recurrenceDays,
      isDaily: formattedItems[0].isDaily,
      checklist: undefined,
      tags: ["#reminder"],
      items: formattedItems,
    };
  }

  // Single reminder check
  const natural = parseNaturalReminder(
    rawText,
    refDate,
    clientTimezoneOffset
  );

  if (natural.isReminder || natural.dueDate) {
    const reminderItem = {
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
    return {
      ...reminderItem,
      items: [reminderItem],
    };
  }

  const noteInfo = generateSmartNoteInfo(rawText);
  const noteItem = {
    type: "note" as const,
    title: noteInfo.title,
    content: noteInfo.content,
    dueDate: undefined,
    dueDateLocal: undefined,
    recurrenceMode: "once" as const,
    recurrenceDays: undefined,
    isDaily: false,
    checklist: undefined,
    tags: ["#note", "#voice"],
  };

  return {
    ...noteItem,
    items: [noteItem],
  };
}

export async function POST(req: NextRequest) {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const contentType = req.headers.get("content-type") || "";

  let rawText = "";
  let fallbackText = "";
  let clientTimezone = "";
  let clientTimezoneOffset: number | undefined = undefined;
  let clientNowISO = "";
  let clientNowLocal = "";
  let transcriptionError: string | null = null;

  let usedGroqTranscription = false;
  let usedGroqStructuring = false;

  try {
    // --------------------------------------------------
    // STEP 1: Get text from audio or direct text input.
    // --------------------------------------------------

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      const audioFile = formData.get("audio") as Blob | null;

      fallbackText = (formData.get("fallbackText") as string) || "";
      clientTimezone = (formData.get("clientTimezone") as string) || "";
      clientNowISO = (formData.get("clientNowISO") as string) || "";
      clientNowLocal = (formData.get("clientNowLocal") as string) || "";

      const offsetRaw = formData.get("clientTimezoneOffset");

      if (
        offsetRaw !== null &&
        offsetRaw !== undefined &&
        offsetRaw !== ""
      ) {
        const parsedOffset = parseInt(offsetRaw as string, 10);

        if (!isNaN(parsedOffset)) {
          clientTimezoneOffset = parsedOffset;
        }
      }

      if (audioFile) {
        if (!groqApiKey) {
          transcriptionError =
            "GROQ_API_KEY environment variable is not configured.";

          console.warn("[/api/ai/process]", transcriptionError);

          if (fallbackText.trim()) {
            rawText = fallbackText.trim();
          }
        } else {
          // ----------------------------------------------
          // STEP 1A: Transcribe audio using Groq.
          // ----------------------------------------------

          try {
            const { mime: cleanMime, ext: cleanExt } =
              getGroqMimeAndExt(
                audioFile.type,
                (audioFile as File).name
              );

            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBytes = new Uint8Array(arrayBuffer);

            console.log("[/api/ai/process] Audio received:", {
              originalType: audioFile.type,
              uploadType: cleanMime,
              filename: cleanExt,
              sizeBytes: audioBytes.byteLength,
              fallbackTextLength: fallbackText.trim().length,
            });

            if (audioBytes.byteLength === 0) {
              transcriptionError =
                "Audio recording file is empty (0 bytes).";

              console.warn(
                "[/api/ai/process]",
                transcriptionError
              );

              if (fallbackText.trim()) {
                rawText = fallbackText.trim();
              }
            } else {
              const fileToUpload = new File(
                [audioBytes],
                cleanExt,
                { type: cleanMime }
              );

              const transcriptionFormData = new FormData();

              transcriptionFormData.append("file", fileToUpload);
              transcriptionFormData.append(
                "model",
                GROQ_TRANSCRIPTION_MODEL
              );
              transcriptionFormData.append(
                "response_format",
                "json"
              );
              transcriptionFormData.append(
                "prompt",
                "Voice reminder, meeting, appointment, checklist, grocery list, task, note."
              );

              const transcriptionRes = await fetch(
                `${GROQ_API_URL}/audio/transcriptions`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${groqApiKey}`,
                  },
                  body: transcriptionFormData,
                }
              );

              if (transcriptionRes.ok) {
                const transcriptionData =
                  await transcriptionRes.json();

                const transcriptionText =
                  (transcriptionData.text || "").trim();

                // Filter common silence hallucinations.
                const isHallucination =
                  /^(?:thanks for watching|thank you for watching|subscribe|you|bye|\.)\.?$/i.test(
                    transcriptionText
                  );

                if (transcriptionText && !isHallucination) {
                  rawText = transcriptionText;
                  usedGroqTranscription = true;

                  console.log(
                    "[/api/ai/process] Groq transcription successful:",
                    {
                      transcriptLength: rawText.length,
                    }
                  );
                } else if (fallbackText.trim()) {
                  rawText = fallbackText.trim();
                }
              } else {
                const errorData = await transcriptionRes
                  .json()
                  .catch(() => ({}));

                transcriptionError =
                  errorData?.error?.message ||
                  `Groq transcription API responded with HTTP ${transcriptionRes.status}.`;

                console.error(
                  "[/api/ai/process] Groq transcription error:",
                  {
                    status: transcriptionRes.status,
                    error: errorData,
                  }
                );

                if (fallbackText.trim()) {
                  rawText = fallbackText.trim();
                }
              }
            }
          } catch (transcriptionErr: unknown) {
            const message =
              transcriptionErr instanceof Error
                ? transcriptionErr.message
                : String(transcriptionErr);

            transcriptionError =
              `Failed to contact Groq transcription API: ${message}`;

            console.error(
              "[/api/ai/process] Transcription request failed:",
              transcriptionErr
            );

            if (fallbackText.trim()) {
              rawText = fallbackText.trim();
            }
          }
        }
      } else if (fallbackText.trim()) {
        rawText = fallbackText.trim();
      }
    } else {
      // Direct text input.
      const json = await req.json();

      rawText = json.text || "";

      clientTimezone = json.clientTimezone || "";
      clientNowISO = json.clientNowISO || "";
      clientNowLocal = json.clientNowLocal || "";

      if (
        json.clientTimezoneOffset !== undefined &&
        json.clientTimezoneOffset !== null
      ) {
        const parsedOffset = Number(json.clientTimezoneOffset);

        if (!isNaN(parsedOffset)) {
          clientTimezoneOffset = parsedOffset;
        }
      }
    }

    // Use browser transcript if audio transcription was empty.
    if (!rawText.trim() && fallbackText.trim()) {
      rawText = fallbackText.trim();
    } else if (
      rawText.trim().length < 4 &&
      fallbackText.trim().length > rawText.trim().length
    ) {
      rawText = fallbackText.trim();
    }

    if (!rawText.trim()) {
      const errorMessage = transcriptionError
        ? `Audio transcription failed: ${transcriptionError}`
        : "No voice could be transcribed. Please speak clearly or check microphone permissions.";

      return NextResponse.json(
        {
          error: errorMessage,
          detail: transcriptionError,
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // STEP 2: Prepare date and timezone information.
    // --------------------------------------------------

    const refDate = clientNowISO
      ? new Date(clientNowISO)
      : new Date();

    const natural = parseNaturalReminder(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    const explicitListIntent = hasExplicitListIntent(rawText);

    // --------------------------------------------------
    // STEP 3: Structure input using Groq chat API.
    // --------------------------------------------------

    if (groqApiKey) {
      try {
        const userLocalString =
          clientNowLocal || refDate.toLocaleString();

        const userTz = clientTimezone || "User Local Time";

        // Calculate wall-clock date in the user's timezone.
        const userWallClock =
          clientTimezoneOffset !== undefined
            ? new Date(
              refDate.getTime() -
              clientTimezoneOffset * 60 * 1000
            )
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

        const todayDayName =
          dayNames[userWallClock.getUTCDay()];

        const todayDateStr =
          `${monthNames[userWallClock.getUTCMonth()]} ` +
          `${userWallClock.getUTCDate()}, ` +
          `${userWallClock.getUTCFullYear()}`;

        const tomorrowWallClock = new Date(
          userWallClock.getTime() + 24 * 60 * 60 * 1000
        );

        const tomorrowDayName =
          dayNames[tomorrowWallClock.getUTCDay()];

        const tomorrowDateStr =
          `${monthNames[tomorrowWallClock.getUTCMonth()]} ` +
          `${tomorrowWallClock.getUTCDate()}, ` +
          `${tomorrowWallClock.getUTCFullYear()}`;

        const systemPrompt = `You are an intelligent assistant that categorizes raw user thoughts and voice transcriptions into one of three formats.

CLASSIFICATION RULES:

1. "note":
- General thoughts, ideas, journal entries, experiences, opinions, and informational content.
- Personal goals, learning goals, and things the user wants to achieve.
- Statements describing multiple subjects, technologies, skills, or experiences.
- A sentence containing commas or the word "and" is still a note unless the user explicitly requests a list.
- Goals with a general timeframe, such as "this month", are notes unless the user explicitly requests a reminder.

Examples:
"I want to learn Next.js, TypeScript and PostgreSQL this month." -> note
"I want to improve my JavaScript and React skills." -> note
"I learned HTML, CSS and JavaScript today." -> note
"My goals are to improve coding and communication." -> note
"I enjoy programming and learning new things." -> note

2. "reminder":
- Explicit requests to be reminded about something.
- Tasks, meetings, appointments, deadlines, and clearly scheduled future activities.
- Actions with a specific date or time.
- Reminder intent and scheduling take priority over list classification.

Examples:
"Remind me to study JavaScript tomorrow." -> reminder
"Call John tomorrow at 5 PM." -> reminder
"Tomorrow I have an important meeting at 3 PM." -> reminder

3. "list":
- Only when the user explicitly wants to create, prepare, or manage a list or checklist.
- Shopping lists, grocery lists, packing lists, and task checklists.
- Direct purchasing instructions such as "Buy milk, eggs and bread."

Examples:
"Create a shopping list with milk, bread and eggs." -> list
"Add milk and eggs to my shopping list." -> list
"Make a checklist for my project tasks." -> list
"Buy milk, bread and eggs." -> list

CRITICAL CLASSIFICATION RULES:
- Never classify something as a list simply because it contains "and".
- Never classify something as a list simply because it contains commas.
- Never classify learning goals or personal goals as lists.
- Never classify a general goal as a reminder just because it mentions "this month" or another broad timeframe.
- A list requires clear list-creation or list-management intent.
- When uncertain between note and list, choose note.
- Reminder intent and actual scheduling take priority over list classification.
- Always understand the complete meaning and intention of the sentence before choosing its type.

CRITICAL USER TIMEZONE CONTEXT:
- User's Current Local Time: ${userLocalString}
- User's Timezone: ${userTz}
- Today in user's timezone is: ${todayDayName}, ${todayDateStr}
- Tomorrow in user's timezone is: ${tomorrowDayName}, ${tomorrowDateStr}

CRITICAL TITLE AND CONTENT RULES:
The title and content MUST be completely different. Never use the complete original user sentence as the title.

1. NOTES:
- Generate a short, meaningful title (2-5 words).
- Content should contain the complete note with its important details in well-written prose.

2. REMINDERS:
- Generate a short, actionable title (2-5 words).
- Do NOT include unnecessary phrases like "I have to", "I need to", "I must", or "Remind me".
- Never put the date/time inside the title if the title already explains the action.
- Content should clearly explain what the user needs to do, preserving important details and deadlines.

3. LISTS:
- Generate a meaningful title describing the list.
- Content should briefly describe the purpose of the list.
- Put individual items inside the checklist array.
- NEVER duplicate checklist items inside the title.

RULES FOR REMINDER SCHEDULING:
- Extract the EXACT time and day specified by the user.
- "4:30 pm" -> 16:30.
- "at 10 am" -> 10:00.
- "tomorrow at 5 pm" -> tomorrow at 17:00.
- "on Friday at 2 pm" -> upcoming Friday at 14:00.
- If only a time is mentioned and that time today is in the future, set for today.
- If only a time is mentioned and that time has passed today, set for tomorrow.
- Output "dueDateLocal" strictly as "YYYY-MM-DDTHH:mm" in USER'S local time.

RECURRENCE RULES:
- "daily", "every day", "everyday" -> "recurrenceMode": "daily".
- "every weekday" -> "recurrenceMode": "custom", "recurrenceDays": [1,2,3,4,5].
- "every weekend" -> "recurrenceMode": "custom", "recurrenceDays": [0,6].
- Specific days (e.g. "every Monday and Friday") -> "recurrenceMode": "custom", "recurrenceDays": [1,5].
- Day numbers are [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat].
- Otherwise "recurrenceMode": "once".

MULTIPLE REMINDERS DETECTION:
- If the user mentions MULTIPLE distinct reminder tasks (e.g. joined by "then", "and then", "after that", "also", or multiple scheduled actions with their own dates/times):
  Example: "Call my friend at 11:05 AM then I have to go to the market at 1:00 PM then I have to go for a walk at 7:30 PM."
  -> This contains 3 distinct reminder tasks:
     1. "Call my friend" at 11:05 AM
     2. "Go to the market" at 1:00 PM
     3. "Go for a walk" at 7:30 PM
- You MUST detect EVERY separate reminder task and return each one inside the "items" array!
- If the user mentions 2, 3, 5, or more reminders in one input, extract ALL of them into the "items" array.
- For each reminder in "items":
  - "type": "reminder"
  - "title": Clean, short actionable title (e.g. "Call my friend", "Go to the market", "Go for a walk")
  - "content": Clear description of that specific task (e.g. "Call my friend at 11:05 AM")
  - "dueDateLocal": "YYYY-MM-DDTHH:mm" in user's local time
  - "recurrenceMode": "once" | "daily" | "custom"
  - "recurrenceDays": null or [days]
  - "tags": ["#reminder", "#task"]
- CRITICAL: Do NOT split notes or shopping checklists into multiple reminders!
  - "Buy milk, eggs, bread and cheese" -> This is a SINGLE "list" item, NOT multiple reminders!
  - "I learned Next.js and TypeScript today and practiced closures" -> This is a SINGLE "note", NOT reminders!
  - Only create multiple reminder items when there are multiple distinct scheduled reminder tasks or time expressions.
- If the input is a single reminder, single note, or single checklist, "items" should contain that 1 item.

Respond ONLY with valid JSON using this exact structure:
{
  "type": "note" | "reminder" | "list",
  "title": "Short descriptive title",
  "content": "Detailed, well-punctuated content",
  "dueDateLocal": "YYYY-MM-DDTHH:mm" or null,
  "recurrenceMode": "once" | "daily" | "custom",
  "recurrenceDays": [1, 3] or null,
  "checklist": [
    { "id": "1", "text": "item description", "completed": false }
  ],
  "tags": ["#tag1", "#tag2"],
  "items": [
    {
      "type": "reminder",
      "title": "Short actionable title",
      "content": "Task description",
      "dueDateLocal": "YYYY-MM-DDTHH:mm",
      "recurrenceMode": "once" | "daily" | "custom",
      "recurrenceDays": [1, 3] or null,
      "tags": ["#reminder", "#task"]
    }
  ]
}`;

        const groqRes = await fetch(
          `${GROQ_API_URL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
              model: GROQ_CHAT_MODEL,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `Please structure this input:\n"${rawText}"`,
                },
              ],
              temperature: 0.2,
            }),
          }
        );

        if (groqRes.ok) {
          const groqData = await groqRes.json();

          const messageContent =
            groqData.choices?.[0]?.message?.content;

          if (!messageContent) {
            throw new Error("Groq returned an empty response.");
          }

          const parsed = JSON.parse(messageContent);

          usedGroqStructuring = true;

          // ----------------------------------------------
          // STEP 4: Process multiple items or single item
          // ----------------------------------------------
          let formattedItems: Array<{
            type: "note" | "reminder" | "list";
            title: string;
            content: string;
            dueDate?: number;
            dueDateLocal?: string;
            recurrenceMode?: "once" | "daily" | "custom";
            recurrenceDays?: number[];
            isDaily?: boolean;
            checklist?: Array<{ id: string; text: string; completed: boolean }>;
            tags: string[];
          }> = [];

          // Check if Groq returned multiple items
          if (Array.isArray(parsed.items) && parsed.items.length > 1 && !explicitListIntent) {
            for (const item of parsed.items) {
              let itemDueDate: number | undefined = undefined;
              if (item.dueDateLocal) {
                try {
                  itemDueDate = parseLocalDatetime(
                    item.dueDateLocal,
                    clientTimezoneOffset
                  );
                } catch {}
              }

              const rMode = (item.recurrenceMode || "once") as "once" | "daily" | "custom";
              const rTitle = (item.title?.trim() || cleanReminderTitle(item.content || "")).trim() || "Reminder";
              const rContent = (item.content?.trim() || cleanReminderContent(item.title || "")).trim() || rTitle;

              formattedItems.push({
                type: "reminder",
                title: rTitle,
                content: rContent,
                dueDate: itemDueDate,
                dueDateLocal: item.dueDateLocal || undefined,
                recurrenceMode: rMode,
                recurrenceDays: item.recurrenceDays || undefined,
                isDaily: rMode === "daily",
                checklist: undefined,
                tags: item.tags?.length ? item.tags : ["#reminder", rMode === "daily" ? "#daily" : "#task"],
              });
            }
          }

          // Rule-based multi-reminder fallback check if Groq missed multiple tasks
          if (formattedItems.length <= 1 && !explicitListIntent) {
            const ruleMulti = parseMultipleReminders(rawText, refDate, clientTimezoneOffset);
            if (ruleMulti && ruleMulti.length > 1) {
              formattedItems = ruleMulti.map((m) => {
                const isDaily = m.recurrenceMode === "daily";
                return {
                  type: "reminder" as const,
                  title: m.title || "Reminder",
                  content: cleanReminderContent(m.title + (m.dueDateLocal ? ` scheduled for ${m.dueDateLocal}` : "")),
                  dueDate: m.dueDate,
                  dueDateLocal: m.dueDateLocal,
                  recurrenceMode: m.recurrenceMode || "once",
                  recurrenceDays: m.recurrenceDays,
                  isDaily,
                  checklist: undefined,
                  tags: ["#reminder", isDaily ? "#daily" : "#task"],
                };
              });
            }
          }

          let finalType: "note" | "reminder" | "list" = "note";
          let finalDueDate: number | undefined = undefined;
          let dueDateLocal: string | undefined = undefined;
          let recurrenceMode: "once" | "daily" | "custom" = "once";
          let recurrenceDays: number[] | undefined = undefined;
          let finalTitle = "";
          let finalContent = "";
          let finalChecklist: Array<{ id: string; text: string; completed: boolean }> | undefined = undefined;
          let finalTags: string[] = [];

          if (formattedItems.length > 1) {
            finalType = "reminder";
            finalTitle = formattedItems[0].title;
            finalContent = cleanReminderContent(rawText);
            finalDueDate = formattedItems[0].dueDate;
            dueDateLocal = formattedItems[0].dueDateLocal;
            recurrenceMode = formattedItems[0].recurrenceMode || "once";
            recurrenceDays = formattedItems[0].recurrenceDays;
            finalTags = ["#reminder"];
          } else {
            // Single item processing
            if (natural.isReminder || natural.dueDate) {
              finalType = "reminder";
            } else if (explicitListIntent) {
              finalType = "list";
            } else {
              finalType = "note";
            }

            if (finalType === "reminder") {
              dueDateLocal =
                parsed.dueDateLocal ||
                natural.dueDateLocal ||
                undefined;

              if (parsed.dueDateLocal) {
                try {
                  finalDueDate = parseLocalDatetime(
                    parsed.dueDateLocal,
                    clientTimezoneOffset
                  );
                } catch (dateError) {
                  console.warn(
                    "[/api/ai/process] Groq date parsing error:",
                    dateError
                  );
                }
              }

              // Use natural parser if Groq did not provide a valid date.
              if (
                (!finalDueDate || !Number.isFinite(finalDueDate)) &&
                natural.dueDate
              ) {
                finalDueDate = natural.dueDate;
                dueDateLocal = natural.dueDateLocal;
              }

              if (
                finalDueDate !== undefined &&
                !Number.isFinite(finalDueDate)
              ) {
                finalDueDate = undefined;
              }
            }

            recurrenceMode =
              finalType === "reminder"
                ? parsed.recurrenceMode ||
                  natural.recurrenceMode ||
                  "once"
                : "once";

            recurrenceDays =
              finalType === "reminder"
                ? parsed.recurrenceDays ||
                  natural.recurrenceDays
                : undefined;

            finalTitle = parsed.title?.trim() || "";
            finalContent = parsed.content?.trim() || "";

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

            if (!finalTitle) {
              if (finalType === "reminder") {
                finalTitle = natural.title;
              } else if (finalType === "list") {
                finalTitle = generateSmartListInfo(rawText).title;
              } else {
                finalTitle = generateSmartNoteInfo(rawText).title;
              }
            }

            if (!finalContent) {
              if (finalType === "reminder") {
                finalContent = cleanReminderContent(rawText);
              } else if (finalType === "list") {
                finalContent = generateSmartListInfo(rawText).content;
              } else {
                finalContent = generateSmartNoteInfo(rawText).content;
              }
            }

            if (finalType === "list") {
              const listInfo = generateSmartListInfo(rawText);
              finalChecklist =
                Array.isArray(parsed.checklist) && parsed.checklist.length > 0
                  ? parsed.checklist
                  : listInfo.checklist;
            }

            finalTags =
              finalType === "list"
                ? ["#list", "#shopping"]
                : finalType === "reminder"
                  ? ["#reminder", recurrenceMode === "daily" ? "#daily" : "#task"]
                  : ["#note", "#voice"];

            formattedItems = [
              {
                type: finalType,
                title: finalTitle,
                content: finalContent,
                dueDate: finalDueDate,
                dueDateLocal: finalType === "reminder" ? dueDateLocal : undefined,
                recurrenceMode,
                recurrenceDays,
                isDaily: recurrenceMode === "daily",
                checklist: finalChecklist,
                tags: finalTags,
              },
            ];
          }

          return NextResponse.json({
            success: true,
            usedGroq: true,
            usedGroqTranscription,
            usedGroqStructuring,
            usedOpenAI: false,
            rawTranscript: rawText,
            type: finalType,
            title: finalTitle,
            content: finalContent,
            dueDate: finalDueDate,
            dueDateLocal:
              finalType === "reminder" ? dueDateLocal : undefined,
            recurrenceMode,
            recurrenceDays,
            isDaily: recurrenceMode === "daily",
            checklist: finalChecklist,
            tags: finalTags,
            items: formattedItems,
          });
        } else {
          const errorData = await groqRes.json().catch(() => ({}));

          console.warn("[/api/ai/process] Groq chat API error:", {
            status: groqRes.status,
            error: errorData,
          });
        }
      } catch (groqErr) {
        console.warn(
          "[/api/ai/process] Groq structuring error:",
          groqErr
        );
      }
    }

    // --------------------------------------------------
    // STEP 8: Rule-based fallback if Groq is unavailable.
    // --------------------------------------------------

    const structured = parseTextRuleBased(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    return NextResponse.json({
      success: true,
      usedGroq: false,
      usedGroqTranscription,
      usedGroqStructuring: false,
      usedOpenAI: false,
      isQuotaExhausted: false,
      rawTranscript: rawText,
      ...structured,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process audio/text.";

    console.error("[/api/ai/process] Unexpected error:", error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
