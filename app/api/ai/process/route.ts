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
 * Strips codecs parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm").
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

  // Standard fallback for Android Chrome MediaRecorder.
  return { mime: "audio/webm", ext: "recording.webm" };
}

/**
 * Detects explicit list-creation or list-management intent.
 *
 * IMPORTANT:
 * - Commas are not list indicators.
 * - The word "and" is not a list indicator.
 * - Multiple subjects or goals do not automatically create lists.
 */
function hasExplicitListIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim();

  // Direct shopping or purchasing instructions.
  if (
    /^(?:please\s+)?(?:buy|purchase|pick up)\b/.test(text)
  ) {
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

  // Explicitly create a list of items.
  if (
    /\b(?:make|create|prepare)\s+(?:a\s+)?list\s+of\b/.test(
      text
    )
  ) {
    return true;
  }

  // Add items to an existing list or checklist.
  if (
    /\b(?:add|put|include)\b.*\b(?:to|in|on)\s+(?:(?:my|the)\s+)?(?:(?:shopping|grocery|packing|todo|to-do|task)\s+)?(?:list|checklist)\b/.test(
      text
    )
  ) {
    return true;
  }

  // Explicitly request a checklist.
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
 * Rule-based text extractor.
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
  const natural = parseNaturalReminder(
    rawText,
    refDate,
    clientTimezoneOffset
  );

  // Reminder intent always takes priority.
  if (natural.isReminder || natural.dueDate) {
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

  // Only explicit list intentions create lists.
  if (hasExplicitListIntent(rawText)) {
    const listInfo = generateSmartListInfo(rawText);

    return {
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
  }

  // Default to Note.
  const noteInfo = generateSmartNoteInfo(rawText);

  return {
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
  let whisperErrorDetail: string | null = null;

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
        if (!apiKey) {
          whisperErrorDetail =
            "OPENAI_API_KEY environment variable is not configured on the server.";
          console.warn("[/api/ai/process]", whisperErrorDetail);

          if (fallbackText.trim()) {
            rawText = fallbackText.trim();
          }
        } else {
          // Send audio to OpenAI Whisper API.
          try {
            const { mime: cleanMime, ext: cleanExt } =
              getWhisperMimeAndExt(
                audioFile.type,
                (audioFile as File).name
              );

            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBytes = new Uint8Array(arrayBuffer);

            console.log("[/api/ai/process] Audio file received:", {
              type: audioFile.type,
              cleanMime,
              cleanExt,
              sizeBytes: audioBytes.byteLength,
              fallbackTextLength: fallbackText.trim().length,
            });

            if (audioBytes.byteLength === 0) {
              whisperErrorDetail =
                "Audio recording file was 0 bytes (no audio stream captured).";
              console.warn("[/api/ai/process]", whisperErrorDetail);

              if (fallbackText) {
                rawText = fallbackText;
              }
            } else {
              const fileToUpload = new File(
                [audioBytes],
                cleanExt,
                { type: cleanMime }
              );

              const whisperFormData = new FormData();
              whisperFormData.append("file", fileToUpload);
              whisperFormData.append("model", "whisper-1");
              whisperFormData.append("response_format", "json");

              whisperFormData.append(
                "prompt",
                "Voice reminder, meeting, appointment, checklist, grocery list, task, note."
              );

              const whisperRes = await fetch(
                "https://api.openai.com/v1/audio/transcriptions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                  },
                  body: whisperFormData,
                }
              );

              if (whisperRes.ok) {
                const whisperData = await whisperRes.json();

                const whisperText = (whisperData.text || "").trim();

                // Filter common Whisper silence hallucinations.
                const isHallucination =
                  /^(?:thanks for watching|thank you for watching|subscribe|you|bye|\.)\.?$/i.test(
                    whisperText
                  );

                if (whisperText && !isHallucination) {
                  rawText = whisperText;
                } else if (fallbackText) {
                  rawText = fallbackText;
                }
              } else {
                const errJson = await whisperRes.json().catch(() => ({}));
                const errMsg =
                  errJson?.error?.message ||
                  `OpenAI Whisper API responded with HTTP ${whisperRes.status} (${whisperRes.statusText})`;
                whisperErrorDetail = errMsg;

                console.error("[/api/ai/process] Whisper API error:", {
                  status: whisperRes.status,
                  error: errJson,
                });

                if (fallbackText) {
                  rawText = fallbackText;
                }
              }
            }
          } catch (whisperErr: unknown) {
            const msg =
              whisperErr instanceof Error
                ? whisperErr.message
                : String(whisperErr);
            whisperErrorDetail = `Failed to contact OpenAI Whisper API: ${msg}`;
            console.error("[/api/ai/process] Whisper request failed:", whisperErr);

            if (fallbackText) {
              rawText = fallbackText;
            }
          }
        }
      } else if (fallbackText) {
        rawText = fallbackText;
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

    // Use fallback text if transcription is empty or too short.
    if (!rawText.trim() && fallbackText.trim()) {
      rawText = fallbackText.trim();
    } else if (
      rawText.trim().length < 4 &&
      fallbackText.trim().length > rawText.trim().length
    ) {
      rawText = fallbackText.trim();
    }

    if (!rawText.trim()) {
      const errorMsg = whisperErrorDetail
        ? `Audio transcription failed: ${whisperErrorDetail}`
        : "No voice could be transcribed. Please speak clearly or check microphone permissions.";

      return NextResponse.json(
        {
          error: errorMsg,
          detail: whisperErrorDetail,
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
    // STEP 3: Structure input with GPT-4o-mini.
    // --------------------------------------------------

    if (apiKey) {
      try {
        const userLocalString =
          clientNowLocal || refDate.toLocaleString();

        const userTz = clientTimezone || "User Local Time";

        // Calculate wall-clock date in user's timezone.
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

CRITICAL TITLE AND CONTENT RULES (MANDATORY):
The title and content MUST be completely different. Never use the complete original user sentence as the title.

1. NOTES:
- Generate a short, meaningful title (2-5 words) summarizing the main subject.
- Content should contain the complete note with its important details in well-written prose.

Example:
Input: "Today I discussed the new project with my team. We decided to finish it by Friday."
Title: "Project Discussion"
Content: "Discussed the new project with the team. The agreed deadline is Friday."

2. REMINDERS:
- Generate a short, actionable title (2-5 words).
- Do NOT include unnecessary phrases like "I have to", "I need to", "I must", or "Remind me".
- Never put the date/time inside the title if the title already explains the action.
- Content should clearly explain what the user needs to do, preserving all important details and deadlines.

Example:
Input: "I have to call John tomorrow at 5 PM."
Title: "Call John"
Content: "Call John tomorrow at 5:00 PM."

3. LISTS:
- Generate a meaningful title describing the list.
- Content should briefly describe the purpose of the list.
- Put individual items inside the checklist array.
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
- You MUST extract the EXACT time and day specified by the user.
- "4:30 pm" -> 16:30.
- "at 10 am" -> 10:00.
- "tomorrow at 5 pm" -> tomorrow at 17:00.
- "on Friday at 2 pm" -> upcoming Friday at 14:00.
- If only a time is mentioned and that time today is in the future in the user's timezone, set for today.
- If only a time is mentioned and that time has already passed today, set for tomorrow.
- Output "dueDateLocal" formatted strictly as "YYYY-MM-DDTHH:mm" (24-hour format in USER'S local time).

Recurrence rules:
- "daily", "every day", "everyday" -> "recurrenceMode": "daily".
- "every weekday" -> "recurrenceMode": "custom", "recurrenceDays": [1,2,3,4,5].
- "every weekend" -> "recurrenceMode": "custom", "recurrenceDays": [0,6].
- Specific days (e.g. "every Monday and Friday") -> "recurrenceMode": "custom", "recurrenceDays": [1,5].
- Day numbers are [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat].
- Otherwise "recurrenceMode": "once".

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

        const gptRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
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
                {
                  role: "user",
                  content: `Please structure this input:\n"${rawText}"`,
                },
              ],
              temperature: 0.2,
            }),
          }
        );

        if (gptRes.ok) {
          const gptData = await gptRes.json();

          const parsed = JSON.parse(
            gptData.choices[0].message.content
          );

          // --------------------------------------------------
          // STEP 4: Determine the final category.
          // --------------------------------------------------

          let finalType: "note" | "reminder" | "list" = "note";

          // Only natural reminder detection can establish reminder intent.
          // GPT's suggested category alone cannot override this.
          if (natural.isReminder || natural.dueDate) {
            finalType = "reminder";
          } else if (explicitListIntent) {
            finalType = "list";
          } else {
            finalType = "note";
          }

          // --------------------------------------------------
          // STEP 5: Handle reminder dates.
          // --------------------------------------------------

          let finalDueDate: number | undefined = undefined;
          let dueDateLocal: string | undefined = undefined;

          if (finalType === "reminder") {
            dueDateLocal =
              parsed.dueDateLocal || natural.dueDateLocal || undefined;

            if (parsed.dueDateLocal) {
              try {
                finalDueDate = parseLocalDatetime(
                  parsed.dueDateLocal,
                  clientTimezoneOffset
                );
              } catch (dateError) {
                console.warn("GPT date parsing error:", dateError);
              }
            }

            // If GPT did not provide a valid date, use the natural parser.
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

          const recurrenceMode =
            finalType === "reminder"
              ? parsed.recurrenceMode ||
              natural.recurrenceMode ||
              "once"
              : "once";

          const recurrenceDays =
            finalType === "reminder"
              ? parsed.recurrenceDays ||
              natural.recurrenceDays
              : undefined;

          // --------------------------------------------------
          // STEP 6: Prepare title and content.
          // --------------------------------------------------

          let finalTitle = parsed.title?.trim() || "";
          let finalContent = parsed.content?.trim() || "";

          // Ensure title and content are distinct and title is concise.
          if (
            !finalTitle ||
            finalTitle.toLowerCase() === finalContent.toLowerCase() ||
            finalTitle.split(/\s+/).length > 6
          ) {
            if (finalType === "reminder") {
              finalTitle = natural.title;

              if (
                !finalContent ||
                finalContent.toLowerCase() === finalTitle.toLowerCase()
              ) {
                finalContent = cleanReminderContent(rawText);
              }
            } else if (finalType === "list") {
              const listInfo = generateSmartListInfo(rawText);

              finalTitle = listInfo.title;

              if (
                !finalContent ||
                finalContent.toLowerCase() === finalTitle.toLowerCase()
              ) {
                finalContent = listInfo.content;
              }
            } else {
              const noteInfo = generateSmartNoteInfo(rawText);

              finalTitle = noteInfo.title;

              if (
                !finalContent ||
                finalContent.toLowerCase() === finalTitle.toLowerCase()
              ) {
                finalContent = noteInfo.content;
              }
            }
          }

          // Final fallback for missing titles or content.
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

          // --------------------------------------------------
          // STEP 7: Prepare checklist and tags.
          // --------------------------------------------------

          let finalChecklist = undefined;

          if (finalType === "list") {
            const listInfo = generateSmartListInfo(rawText);

            finalChecklist =
              Array.isArray(parsed.checklist) &&
                parsed.checklist.length > 0
                ? parsed.checklist
                : listInfo.checklist;
          }

          const finalTags =
            finalType === "list"
              ? ["#list", "#shopping"]
              : finalType === "reminder"
                ? [
                  "#reminder",
                  recurrenceMode === "daily" ? "#daily" : "#task",
                ]
                : ["#note", "#voice"];

          return NextResponse.json({
            success: true,
            usedOpenAI: true,
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
          });
        } else {
          const errorData = await gptRes.json().catch(() => ({}));
          console.warn("GPT API error:", errorData);
        }
      } catch (gptErr) {
        console.warn("GPT structuring error:", gptErr);
      }
    }

    // --------------------------------------------------
    // STEP 8: Fallback if GPT is unavailable.
    // --------------------------------------------------

    const structured = parseTextRuleBased(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    return NextResponse.json({
      success: true,
      usedOpenAI: false,
      isQuotaExhausted: true,
      rawTranscript: rawText,
      ...structured,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process audio/text.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
