
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

type ItemType = "note" | "reminder" | "list";
type RecurrenceMode = "once" | "daily" | "custom";

type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

type FormattedItem = {
  type: ItemType;
  title: string;
  content: string;
  dueDate?: number;
  dueDateLocal?: string;
  recurrenceMode: RecurrenceMode;
  recurrenceDays?: number[];
  isDaily: boolean;
  checklist?: ChecklistItem[];
  tags: string[];
};

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

  return { mime: "audio/webm", ext: "recording.webm" };
}

/**
 * Detect an actual reminder request.
 */
function hasExplicitReminderIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim();

  return (
    /\bremind\s+me\b/.test(text) ||
    /\bset\s+(?:a\s+)?reminder\b/.test(text) ||
    /\bdon't\s+let\s+me\s+forget\b/.test(text) ||
    /\bdo\s+not\s+let\s+me\s+forget\b/.test(text) ||
    /\balert\s+me\b/.test(text)
  );
}

/**
 * Detect list intent without treating every sentence
 * containing "and" or commas as a list.
 */
function hasExplicitListIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim();

  const patterns = [
    // Shopping and purchasing.
    /\b(?:buy|purchase|pick\s+up)\b/,
    /\b(?:need|have|want)\s+to\s+buy\b/,
    /\b(?:shopping|grocery)\s+list\b/,

    // Packing.
    /\bthings?\s+to\s+pack\b/,
    /\bitems?\s+to\s+pack\b/,
    /\bpacking\s+list\b/,
    /\bthings?\s+to\s+bring\b/,

    // Explicit lists and checklists.
    /\b(?:make|create|prepare|start)\s+(?:(?:a|an|my|the)\s+)?(?:(?:shopping|grocery|packing|todo|to-do|task|work)\s+)?(?:list|checklist)\b/,
    /\bchecklist\b/,
    /\b(?:my|the)\s+(?:shopping|grocery|packing)\s+list\b/,

    // Add items to any named list.
    /\b(?:add|put|include)\b.+\b(?:to|in|on)\s+(?:(?:my|the)\s+)?[\w-]+(?:\s+[\w-]+){0,5}\s+lists?\b/,

    // Create a specifically named list.
    /\b(?:create|make|start|prepare)\s+(?:a|an|my|the)\s+[\w-]+(?:\s+[\w-]+){0,5}\s+lists?\b/,

    // A named list explicitly mentioned.
    /\b(?:my|the)\s+[\w-]+(?:\s+[\w-]+){0,5}\s+lists?\b/,

    // Daily task collections.
    /\bmy\s+daily\s+tasks?\s+(?:are|include|:)\b/,
    /\bmy\s+tasks?\s+(?:are|include|:)\b/,

    // Plans containing actionable activities.
    /\bmy\s+weekend\s+plan\s*:/,
    /\bmy\s+daily\s+plan\s*:/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Deterministically extract items from sentences like:
 *
 * "Add notebook, pen and pencil to my school supplies list."
 *
 * This avoids relying entirely on AI to extract checklist items.
 */
function extractItemsFromAddToList(
  rawText: string
): { title: string; items: ChecklistItem[] } | null {
  const match = rawText.match(
    /^\s*(?:please\s+)?(?:add|put|include)\s+(.+?)\s+(?:to|in|on)\s+(?:(?:my|the)\s+)?(.+?)\s+lists?\s*[.!?]*$/i
  );

  if (!match) return null;

  const rawItems = match[1].trim();
  const rawListName = match[2].trim();

  if (!rawItems || !rawListName) return null;

  const items = rawItems
    .replace(/\s+and\s+/gi, ",")
    .replace(/\s*&\s*/g, ",")
    .split(",")
    .map((item) =>
      item.replace(/^[\s,]+|[\s,.!?]+$/g, "").trim()
    )
    .filter(Boolean);

  if (items.length === 0) return null;

  const title = rawListName
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    title,
    items: items.map((item, index) => ({
      id: String(index + 1),
      text: item,
      completed: false,
    })),
  };
}

/**
 * Validate checklist items returned by Groq or the rule-based parser.
 */
function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const text = item.trim();

        if (!text) return null;

        return {
          id: String(index + 1),
          text,
          completed: false,
        };
      }

      if (!item || typeof item !== "object") return null;

      const entry = item as Record<string, unknown>;
      const itemText = String(entry.text || "").trim();

      if (!itemText) return null;

      return {
        id: String(entry.id || index + 1),
        text: itemText,
        completed: Boolean(entry.completed),
      };
    })
    .filter((item): item is ChecklistItem => item !== null);
}

/**
 * Convert reminder parser results into the application's format.
 */
function formatRuleBasedReminders(
  rawText: string,
  refDate: Date,
  timezoneOffset?: number
): FormattedItem[] {
  const reminders = parseMultipleReminders(
    rawText,
    refDate,
    timezoneOffset
  );

  if (!reminders || reminders.length <= 1) {
    return [];
  }

  return reminders.map((reminder) => {
    const isDaily = reminder.recurrenceMode === "daily";

    return {
      type: "reminder",
      title: reminder.title || "Reminder",
      content: cleanReminderContent(
        reminder.title +
        (reminder.dueDateLocal
          ? ` scheduled for ${reminder.dueDateLocal}`
          : "")
      ),
      dueDate: reminder.dueDate,
      dueDateLocal: reminder.dueDateLocal,
      recurrenceMode: reminder.recurrenceMode || "once",
      recurrenceDays: reminder.recurrenceDays,
      isDaily,
      checklist: undefined,
      tags: ["#reminder", isDaily ? "#daily" : "#task"],
    };
  });
}

/**
 * Rule-based fallback when Groq is unavailable.
 */
function parseTextRuleBased(
  rawText: string,
  refDate: Date = new Date(),
  clientTimezoneOffset?: number
) {
  const natural = parseNaturalReminder(
    rawText,
    refDate,
    clientTimezoneOffset
  );

  const reminderIntent =
    hasExplicitReminderIntent(rawText) ||
    natural.isReminder ||
    Boolean(natural.dueDate);

  const listIntent =
    !reminderIntent && hasExplicitListIntent(rawText);

  // Reminder priority.
  if (reminderIntent) {
    const multiple = formatRuleBasedReminders(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    if (multiple.length > 1) {
      return {
        type: "reminder" as const,
        title: multiple[0].title,
        content: cleanReminderContent(rawText),
        dueDate: multiple[0].dueDate,
        dueDateLocal: multiple[0].dueDateLocal,
        recurrenceMode: multiple[0].recurrenceMode,
        recurrenceDays: multiple[0].recurrenceDays,
        isDaily: false,
        checklist: undefined,
        tags: ["#reminder"],
        items: multiple,
      };
    }

    const reminderItem: FormattedItem = {
      type: "reminder",
      title: natural.title || cleanReminderTitle(rawText),
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

  // List priority after reminders.
  if (listIntent) {
    const listInfo = generateSmartListInfo(rawText);
    const extractedList = extractItemsFromAddToList(rawText);

    const listItem: FormattedItem = {
      type: "list",
      title: extractedList?.title || listInfo.title,
      content: extractedList
        ? `Items to add to your ${extractedList.title} list.`
        : listInfo.content,
      dueDate: undefined,
      dueDateLocal: undefined,
      recurrenceMode: "once",
      recurrenceDays: undefined,
      isDaily: false,
      checklist: extractedList
        ? extractedList.items
        : normalizeChecklist(listInfo.checklist),
      tags: ["#list", "#voice"],
    };

    return {
      ...listItem,
      items: [listItem],
    };
  }

  // Everything else is a note.
  const noteInfo = generateSmartNoteInfo(rawText);

  const noteItem: FormattedItem = {
    type: "note",
    title: noteInfo.title,
    content: noteInfo.content,
    dueDate: undefined,
    dueDateLocal: undefined,
    recurrenceMode: "once",
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
  let clientTimezoneOffset: number | undefined;
  let clientNowISO = "";
  let clientNowLocal = "";

  let transcriptionError: string | null = null;

  let usedGroqTranscription = false;
  let usedGroqStructuring = false;

  try {
    // STEP 1: Get text from audio or direct text input.

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      const audioFile = formData.get("audio") as Blob | null;

      fallbackText = (formData.get("fallbackText") as string) || "";
      clientTimezone = (formData.get("clientTimezone") as string) || "";
      clientNowISO = (formData.get("clientNowISO") as string) || "";
      clientNowLocal = (formData.get("clientNowLocal") as string) || "";

      const offsetRaw = formData.get("clientTimezoneOffset");

      if (offsetRaw !== null && offsetRaw !== "") {
        const parsedOffset = Number(offsetRaw);

        if (Number.isFinite(parsedOffset)) {
          clientTimezoneOffset = parsedOffset;
        }
      }

      if (audioFile) {
        if (!groqApiKey) {
          transcriptionError =
            "GROQ_API_KEY environment variable is not configured.";

          if (fallbackText.trim()) {
            rawText = fallbackText.trim();
          }
        } else {
          try {
            const { mime, ext } = getGroqMimeAndExt(
              audioFile.type,
              (audioFile as File).name
            );

            const audioBytes = new Uint8Array(
              await audioFile.arrayBuffer()
            );

            console.log("[AI] Audio received:", {
              originalType: audioFile.type,
              uploadType: mime,
              sizeBytes: audioBytes.byteLength,
              fallbackTextLength: fallbackText.length,
            });

            if (audioBytes.byteLength === 0) {
              transcriptionError = "Audio recording file is empty.";

              if (fallbackText.trim()) {
                rawText = fallbackText.trim();
              }
            } else {
              const file = new File([audioBytes], ext, { type: mime });

              const transcriptionFormData = new FormData();

              transcriptionFormData.append("file", file);
              transcriptionFormData.append(
                "model",
                GROQ_TRANSCRIPTION_MODEL
              );
              transcriptionFormData.append("response_format", "json");
              transcriptionFormData.append(
                "prompt",
                "Voice reminders, meetings, appointments, shopping lists, packing lists, checklists, tasks, notes and personal thoughts."
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
                const transcriptionData = await transcriptionRes.json();
                const transcriptionText =
                  (transcriptionData.text || "").trim();

                const isHallucination =
                  /^(?:thanks for watching|thank you for watching|subscribe|you|bye|\.)\.?$/i.test(
                    transcriptionText
                  );

                if (transcriptionText && !isHallucination) {
                  rawText = transcriptionText;
                  usedGroqTranscription = true;
                } else if (fallbackText.trim()) {
                  rawText = fallbackText.trim();
                }
              } else {
                const errorData = await transcriptionRes
                  .json()
                  .catch(() => ({}));

                transcriptionError =
                  errorData?.error?.message ||
                  `Groq transcription failed: HTTP ${transcriptionRes.status}`;

                console.error("[AI] Transcription error:", errorData);

                if (fallbackText.trim()) {
                  rawText = fallbackText.trim();
                }
              }
            }
          } catch (error) {
            transcriptionError =
              error instanceof Error
                ? error.message
                : "Transcription failed.";

            console.error("[AI] Transcription request failed:", error);

            if (fallbackText.trim()) {
              rawText = fallbackText.trim();
            }
          }
        }
      } else if (fallbackText.trim()) {
        rawText = fallbackText.trim();
      }
    } else {
      const json = await req.json();

      rawText = json.text || "";

      clientTimezone = json.clientTimezone || "";
      clientNowISO = json.clientNowISO || "";
      clientNowLocal = json.clientNowLocal || "";

      if (
        json.clientTimezoneOffset !== undefined &&
        json.clientTimezoneOffset !== null
      ) {
        const offset = Number(json.clientTimezoneOffset);

        if (Number.isFinite(offset)) {
          clientTimezoneOffset = offset;
        }
      }
    }

    // Use browser transcription if Groq transcription failed.
    if (!rawText.trim() && fallbackText.trim()) {
      rawText = fallbackText.trim();
    }

    if (
      rawText.trim().length < 4 &&
      fallbackText.trim().length > rawText.trim().length
    ) {
      rawText = fallbackText.trim();
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        {
          error: transcriptionError
            ? `Audio transcription failed: ${transcriptionError}`
            : "No voice could be transcribed. Please speak clearly or check microphone permissions.",
          detail: transcriptionError,
        },
        { status: 400 }
      );
    }

    // STEP 2: Prepare timezone and classification.

    const parsedClientDate = clientNowISO
      ? new Date(clientNowISO)
      : new Date();

    const refDate = Number.isNaN(parsedClientDate.getTime())
      ? new Date()
      : parsedClientDate;

    const natural = parseNaturalReminder(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    const reminderIntent =
      hasExplicitReminderIntent(rawText) ||
      natural.isReminder ||
      Boolean(natural.dueDate);

    const explicitListIntent =
      !reminderIntent && hasExplicitListIntent(rawText);

    console.log("[AI] Input classification:", {
      rawText,
      reminderIntent,
      listIntent: explicitListIntent,
      naturalReminder: natural.isReminder,
      dueDate: natural.dueDateLocal,
    });

    // STEP 3: Structure input using Groq.

    if (groqApiKey) {
      try {
        const userLocalString =
          clientNowLocal || refDate.toLocaleString();

        const userTz = clientTimezone || "User Local Time";

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

        const formatLocalDate = (date: Date) =>
          `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;

        const todayDayName = dayNames[userWallClock.getUTCDay()];
        const todayDateStr = formatLocalDate(userWallClock);

        const tomorrowWallClock = new Date(
          userWallClock.getTime() + 24 * 60 * 60 * 1000
        );

        const tomorrowDayName =
          dayNames[tomorrowWallClock.getUTCDay()];

        const tomorrowDateStr =
          formatLocalDate(tomorrowWallClock);

        const systemPrompt = `
You are an intelligent assistant for a voice-based reminder, note and checklist application.

Classify every input into exactly one category:
note, reminder, or list.

CURRENT USER TIME:
${userLocalString}

TIMEZONE:
${userTz}

TODAY:
${todayDayName}, ${todayDateStr}

TOMORROW:
${tomorrowDayName}, ${tomorrowDateStr}

====================================
1. REMINDER CLASSIFICATION
====================================

Classify as reminder when:
- The user explicitly says "remind me".
- The user asks not to forget something.
- The user specifies an appointment, meeting, task or activity with a date or time.
- The user specifies a relative time such as after 30 minutes or in two hours.
- The user specifies a recurrence such as every day.

Examples:

"Remind me to attend a meeting tomorrow at 10 AM."
=> reminder, tomorrow 10:00

"Remind me to call my mother today at 8 PM."
=> reminder, today 20:00

"Remind me to take my medicine every day at 9 AM."
=> reminder, daily at 09:00

"Remind me to submit my project on Monday at 11 AM."
=> reminder, Monday 11:00

"Remind me to pay the electricity bill on the 20th of this month."
=> reminder, 20th of this month

"Remind me to drink water after 30 minutes."
=> reminder, 30 minutes later

"Remind me to attend my doctor's appointment next Friday at 4 PM."
=> reminder, next Friday 16:00

"I have an interview tomorrow at 2:30 PM. Don't let me forget."
=> reminder, tomorrow 14:30

"Remind me to wake up early at 6 AM tomorrow."
=> reminder, tomorrow 06:00

"Remind me to complete my assignment in two hours."
=> reminder, two hours later

IMPORTANT:
Do not classify a general learning goal or a general thought as a reminder merely because it contains a timeframe.

"I want to learn Next.js this month."
=> note

====================================
2. LIST CLASSIFICATION
====================================

Classify as list when the user:
- Wants to buy or purchase multiple items.
- Mentions things to pack or bring.
- Creates a shopping or grocery list.
- Creates a task checklist.
- Describes a collection of actionable tasks.
- Describes a weekend plan consisting of separate activities.
- Asks to add items to an existing list.
- Creates a specifically named list, such as school supplies list,
  office supplies list, travel essentials list or books list.

Examples:

"Buy milk, eggs, bread and butter."
=> list

"Create a shopping list: rice, sugar, tea, coffee and salt."
=> list

"Things to pack for my trip: clothes, shoes, charger and passport."
=> list

"My daily tasks are exercise, meditation, reading and studying."
=> list

"Add apples, bananas, oranges and grapes to my grocery list."
=> list

"Create a checklist for my office work: check emails, attend meetings and submit reports."
=> list

"I need to buy a laptop, mouse, keyboard and headphones."
=> list

"Make a cleaning checklist: wash clothes, clean the kitchen and vacuum the room."
=> list

"My weekend plan: visit the market, clean my room and meet my friends."
=> list

"Add notebook, pen, pencil, eraser and ruler to my school supplies list."
=> list

"Create a school supplies list with notebook, pen and pencil."
=> list

"Add laptop, mouse and keyboard to my office supplies list."
=> list

"Add passport, charger and clothes to my travel essentials list."
=> list

For lists:
- Generate a short meaningful title.
- Put every individual item in checklist.
- Each checklist item must be separate.
- Do not put all checklist items into a single string.
- Do not create reminders for individual checklist items.
- Keep the content short and descriptive.
- Preserve the user's named list category in the title.

====================================
3. NOTE CLASSIFICATION
====================================

Classify as note for:
- General thoughts.
- Learning experiences.
- Ideas.
- Opinions.
- Journal entries.
- Informational statements.
- Learning goals.
- Personal goals.
- General descriptions.

Examples:

"Today I learned something interesting about JavaScript closures."
=> note

"React hooks help us manage state and side effects in functional components."
=> note

"My idea is to build a personal finance application that tracks monthly expenses."
=> note

"I watched a video about artificial intelligence and machine learning today."
=> note

"The meeting went well and we discussed the new project requirements."
=> note

"I want to learn Next.js, TypeScript and PostgreSQL this month."
=> note

"Sometimes the best way to learn programming is to build real projects."
=> note

"Today was a productive day. I completed my backend API and fixed several bugs."
=> note

"My project idea is to create an application that converts voice into organized notes and reminders."
=> note

"I learned that promises in JavaScript are used to handle asynchronous operations."
=> note

IMPORTANT:
- Commas and "and" do not automatically indicate a list.
- A learning goal is a note.
- An idea is a note.
- A collection of actionable activities can be a list.
- When uncertain between a note and list, choose note.
- Explicit reminder intent takes priority over list intent.

====================================
4. MULTIPLE REMINDERS
====================================

If the user describes multiple distinct reminder tasks, return every task in items.

Example:

"Call my friend at 11 AM then go to the market at 1 PM and walk at 7 PM."

Return three separate reminders.

Do not split:
- Notes into reminders.
- Shopping lists into reminders.
- Packing lists into reminders.
- Checklists into reminders.

====================================
5. DATE AND TIME RULES
====================================

Use the user's current local time and timezone.

Output dueDateLocal in this exact format:

YYYY-MM-DDTHH:mm

Examples:
- 10 AM => 10:00
- 4:30 PM => 16:30
- Tomorrow at 5 PM => tomorrow 17:00
- Friday at 2 PM => upcoming Friday 14:00

If only a time is provided:
- Use today if that time has not passed.
- Otherwise use tomorrow.

For relative time:
- After 30 minutes => current local time + 30 minutes.
- In two hours => current local time + 2 hours.

Do not invent dates or times.

====================================
6. RECURRENCE
====================================

- Every day => daily
- Daily => daily
- Every weekday => custom, [1,2,3,4,5]
- Every weekend => custom, [0,6]
- Every Monday and Friday => custom, [1,5]
- Otherwise => once

Day numbers:
0 = Sunday
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
6 = Saturday

====================================
7. TITLE AND CONTENT
====================================

Notes:
- Short title, preferably 2-5 words.
- Content contains the complete important thought.

Reminders:
- Short actionable title.
- Do not include unnecessary "Remind me" wording.
- Content describes the task.

Lists:
- Meaningful title.
- Content describes the purpose.
- Individual items go in checklist.

====================================
8. OUTPUT
====================================

Respond ONLY with valid JSON.

Use exactly this structure:

{
  "type": "note",
  "title": "Short title",
  "content": "Description",
  "dueDateLocal": null,
  "recurrenceMode": "once",
  "recurrenceDays": null,
  "checklist": [],
  "tags": ["#note", "#voice"],
  "items": [
    {
      "type": "note",
      "title": "Short title",
      "content": "Description",
      "dueDateLocal": null,
      "recurrenceMode": "once",
      "recurrenceDays": null,
      "checklist": [],
      "tags": ["#note", "#voice"]
    }
  ]
}

For a reminder, use type reminder.
For a list, use type list.

For a list, checklist must contain objects:

[
  {
    "id": "1",
    "text": "Milk",
    "completed": false
  }
]

For multiple reminders, items must contain every separate reminder.

For a single item, items must contain exactly one item.
`;

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
                {
                  role: "system",
                  content: systemPrompt,
                },
                {
                  role: "user",
                  content: `Structure this user input:\n${rawText}`,
                },
              ],
              temperature: 0.1,
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

          // STEP 4: Multiple reminder processing.

          let formattedItems: FormattedItem[] = [];

          if (reminderIntent) {
            if (
              Array.isArray(parsed.items) &&
              parsed.items.length > 1
            ) {
              formattedItems = parsed.items.map(
                (item: Record<string, unknown>) => {
                  let dueDate: number | undefined;

                  if (typeof item.dueDateLocal === "string") {
                    try {
                      dueDate = parseLocalDatetime(
                        item.dueDateLocal,
                        clientTimezoneOffset
                      );
                    } catch (error) {
                      console.warn(
                        "[AI] Invalid reminder date:",
                        error
                      );
                    }
                  }

                  const recurrenceMode =
                    (item.recurrenceMode === "daily" ||
                      item.recurrenceMode === "custom"
                      ? item.recurrenceMode
                      : "once") as RecurrenceMode;

                  const title =
                    typeof item.title === "string" &&
                      item.title.trim()
                      ? item.title.trim()
                      : cleanReminderTitle(
                        String(item.content || "")
                      );

                  const content =
                    typeof item.content === "string" &&
                      item.content.trim()
                      ? item.content.trim()
                      : cleanReminderContent(title);

                  return {
                    type: "reminder",
                    title,
                    content,
                    dueDate,
                    dueDateLocal:
                      typeof item.dueDateLocal === "string"
                        ? item.dueDateLocal
                        : undefined,
                    recurrenceMode,
                    recurrenceDays: Array.isArray(
                      item.recurrenceDays
                    )
                      ? item.recurrenceDays.filter(
                        (day: unknown) =>
                          Number.isInteger(day) &&
                          Number(day) >= 0 &&
                          Number(day) <= 6
                      )
                      : undefined,
                    isDaily: recurrenceMode === "daily",
                    checklist: undefined,
                    tags: ["#reminder", "#task"],
                  };
                }
              );
            }

            // Rule-based multiple-reminder fallback.
            if (formattedItems.length <= 1) {
              const ruleItems = formatRuleBasedReminders(
                rawText,
                refDate,
                clientTimezoneOffset
              );

              if (ruleItems.length > 1) {
                formattedItems = ruleItems;
              }
            }
          }

          // STEP 5: Final single-item classification.

          if (formattedItems.length <= 1) {
            let finalType: ItemType;

            if (reminderIntent) {
              finalType = "reminder";
            } else if (
              explicitListIntent ||
              parsed.type === "list"
            ) {
              // Use explicit detection and AI classification.
              finalType = "list";
            } else {
              finalType = "note";
            }

            let finalTitle =
              typeof parsed.title === "string"
                ? parsed.title.trim()
                : "";

            let finalContent =
              typeof parsed.content === "string"
                ? parsed.content.trim()
                : "";

            let finalDueDate: number | undefined;
            let dueDateLocal: string | undefined;

            let recurrenceMode: RecurrenceMode = "once";
            let recurrenceDays: number[] | undefined;

            let finalChecklist: ChecklistItem[] | undefined;

            if (finalType === "reminder") {
              dueDateLocal =
                typeof parsed.dueDateLocal === "string" &&
                  parsed.dueDateLocal.trim()
                  ? parsed.dueDateLocal.trim()
                  : natural.dueDateLocal;

              if (dueDateLocal) {
                try {
                  finalDueDate = parseLocalDatetime(
                    dueDateLocal,
                    clientTimezoneOffset
                  );
                } catch (error) {
                  console.warn(
                    "[AI] Groq date parsing error:",
                    error
                  );
                }
              }

              // Use the natural date parser when Groq fails.
              if (
                (finalDueDate === undefined ||
                  !Number.isFinite(finalDueDate)) &&
                natural.dueDate
              ) {
                finalDueDate = natural.dueDate;
                dueDateLocal = natural.dueDateLocal;
              }

              const parsedRecurrence = parsed.recurrenceMode;

              recurrenceMode =
                parsedRecurrence === "daily" ||
                  parsedRecurrence === "custom"
                  ? parsedRecurrence
                  : natural.recurrenceMode || "once";

              recurrenceDays = Array.isArray(
                parsed.recurrenceDays
              )
                ? parsed.recurrenceDays
                : natural.recurrenceDays;
            }

            // Generate the correct title and content.
            if (finalType === "reminder") {
              if (
                !finalTitle ||
                finalTitle.split(/\s+/).length > 7
              ) {
                finalTitle =
                  natural.title || cleanReminderTitle(rawText);
              }

              if (!finalContent) {
                finalContent = cleanReminderContent(rawText);
              }
            }

            if (finalType === "list") {
              const listInfo = generateSmartListInfo(rawText);

              // Deterministic extraction for "add ... to my ... list".
              const extractedList =
                extractItemsFromAddToList(rawText);

              if (extractedList) {
                finalTitle = extractedList.title;
                finalContent =
                  `Items to add to your ${extractedList.title} list.`;

                finalChecklist = extractedList.items;
              } else {
                if (
                  !finalTitle ||
                  finalTitle.split(/\s+/).length > 7
                ) {
                  finalTitle = listInfo.title;
                }

                if (!finalContent) {
                  finalContent = listInfo.content;
                }

                const aiChecklist = normalizeChecklist(
                  parsed.checklist
                );

                const generatedChecklist = normalizeChecklist(
                  listInfo.checklist
                );

                // Prefer the AI's individually extracted items.
                // Use rule-based extraction when AI returns none.
                finalChecklist =
                  aiChecklist.length > 0
                    ? aiChecklist
                    : generatedChecklist;
              }

              if (!finalChecklist || finalChecklist.length === 0) {
                console.warn(
                  "[AI] List detected but no checklist items extracted:",
                  rawText
                );
              }
            }

            if (finalType === "note") {
              const noteInfo = generateSmartNoteInfo(rawText);

              if (
                !finalTitle ||
                finalTitle.split(/\s+/).length > 7
              ) {
                finalTitle = noteInfo.title;
              }

              if (!finalContent) {
                finalContent = noteInfo.content;
              }
            }

            if (!finalTitle) {
              finalTitle = rawText.slice(0, 60).trim();
            }

            if (!finalContent) {
              finalContent = rawText;
            }

            const finalTags =
              finalType === "reminder"
                ? [
                  "#reminder",
                  recurrenceMode === "daily"
                    ? "#daily"
                    : "#task",
                ]
                : finalType === "list"
                  ? ["#list", "#voice"]
                  : ["#note", "#voice"];

            const singleItem: FormattedItem = {
              type: finalType,
              title: finalTitle,
              content: finalContent,
              dueDate: finalDueDate,
              dueDateLocal:
                finalType === "reminder"
                  ? dueDateLocal
                  : undefined,
              recurrenceMode,
              recurrenceDays,
              isDaily: recurrenceMode === "daily",
              checklist: finalChecklist,
              tags: finalTags,
            };

            formattedItems = [singleItem];
          }

          // STEP 6: Prepare response.

          const primaryItem = formattedItems[0];

          return NextResponse.json({
            success: true,
            usedGroq: true,
            usedGroqTranscription,
            usedGroqStructuring,
            usedOpenAI: false,

            rawTranscript: rawText,

            type:
              formattedItems.length > 1
                ? "reminder"
                : primaryItem.type,

            title: primaryItem.title,

            content:
              formattedItems.length > 1
                ? cleanReminderContent(rawText)
                : primaryItem.content,

            dueDate: primaryItem.dueDate,
            dueDateLocal: primaryItem.dueDateLocal,
            recurrenceMode: primaryItem.recurrenceMode,
            recurrenceDays: primaryItem.recurrenceDays,
            isDaily: primaryItem.isDaily,
            checklist: primaryItem.checklist,

            tags:
              formattedItems.length > 1
                ? ["#reminder"]
                : primaryItem.tags,

            items: formattedItems,
          });
        }

        const errorData = await groqRes
          .json()
          .catch(() => ({}));

        console.warn("[AI] Groq chat API error:", {
          status: groqRes.status,
          error: errorData,
        });
      } catch (error) {
        console.error("[AI] Groq structuring error:", error);
      }
    }

    // STEP 7: Rule-based fallback.

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

    console.error("[AI] Unexpected processing error:", error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
