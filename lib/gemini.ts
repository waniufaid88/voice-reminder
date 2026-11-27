import { GoogleGenAI, Type } from "@google/genai";

export interface GeminiStructuredOutput {
  type: "reminder" | "list" | "note";
  title: string;
  content: string;
  checklist?: string[];
  dueDateLocal?: string | null;
  recurrenceMode?: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  recurrenceDays?: number[];
  teamName?: string | null;
  tags?: string[];
  multipleReminders?: Array<{
    title: string;
    content?: string;
    dueDateLocal: string;
    recurrenceMode?: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
    recurrenceDays?: number[];
  }>;
}

export const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: ["reminder", "list", "note"],
      description:
        "Classification: 'reminder' for time/date commitments, alarms, or scheduled tasks; 'list' for collections/enumerations of 2+ items, supplies, kit contents, ingredients, or chores; 'note' for informational thoughts, ideas, meeting agendas/summaries, or knowledge.",
    },
    title: {
      type: Type.STRING,
      description:
        "Short, descriptive title (2-6 words), e.g. 'First-Aid Kit', 'Grocery Shopping', 'Team Sync', 'Doctor Appointment'.",
    },
    content: {
      type: Type.STRING,
      description: "Clean description, summary, or note body.",
    },
    checklist: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Array of individual checklist items when type is 'list'. Empty array if not a list.",
    },
    dueDateLocal: {
      type: Type.STRING,
      description:
        "For reminders: Local date and time string in ISO format 'YYYY-MM-DDTHH:mm:ss' (e.g. '2026-11-28T10:00:00'). Null or omitted if not a reminder.",
    },
    recurrenceMode: {
      type: Type.STRING,
      enum: ["once", "daily", "weekly", "monthly", "yearly", "custom"],
      description: "Recurrence mode. Default 'once'.",
    },
    recurrenceDays: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description:
        "0 for Sunday, 1 for Monday ... 6 for Saturday if recurring on specific days.",
    },
    teamName: {
      type: Type.STRING,
      description:
        "Spoken or written team destination if user explicitly mentioned a team (e.g. 'Marketing', 'Dev Team'), else null.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Array of relevant tags, e.g. ['#list', '#supplies'] or ['#reminder', '#urgent'] or ['#note', '#meeting'].",
    },
    multipleReminders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          dueDateLocal: { type: Type.STRING },
          recurrenceMode: {
            type: Type.STRING,
            enum: ["once", "daily", "weekly", "monthly", "yearly", "custom"],
          },
          recurrenceDays: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
        },
        required: ["title", "dueDateLocal"],
      },
      description:
        "If input contains 2 or more distinct reminders with separate times (e.g. 'Call mom at 11am and meet doctor at 3pm'), provide each here.",
    },
  },
  required: ["type", "title", "content"],
};

export function buildGeminiSystemInstruction(options: {
  userLocalDate: string;
  userDayName: string;
  userTimezone: string;
}): string {
  return `You are an expert AI assistant that categorizes and structures personal voice and text inputs into one of three distinct types: "reminder", "list", or "note".

CURRENT DATE & TIME CONTEXT:
Today is: ${options.userDayName}, ${options.userLocalDate}
Timezone: ${options.userTimezone}

============================================================
1. CLASSIFICATION CRITERIA (READ CAREFULLY)
============================================================

1. "list":
- MUST be chosen whenever the input describes a collection, pack, kit, or enumeration of TWO OR MORE items, supplies, ingredients, products, components, or discrete tasks.
- Examples of lists:
  * Kit, pack, or set preparation / assembly:
    - "Prepare a first-aid kit with bandages, cotton, antiseptic cream, painkillers and a thermometer." -> type: "list", title: "First-Aid Kit", checklist: ["Bandages", "Cotton", "Antiseptic cream", "Painkillers", "Thermometer"]
    - "a first-aid kit with bandages, cotton, antiseptic cream, painkillers and a thermometer." -> type: "list", title: "First-Aid Kit", checklist: ["Bandages", "Cotton", "Antiseptic cream", "Painkillers", "Thermometer"]
    - "Car emergency kit with jumper cables, tow strap, flashlight and tire inflator." -> type: "list", title: "Car Emergency Kit", checklist: ["Jumper cables", "Tow strap", "Flashlight", "Tire inflator"]
    - "Baby essentials with diapers, baby wipes, rash cream and baby formula." -> type: "list", title: "Baby Essentials", checklist: ["Diapers", "Baby wipes", "Rash cream", "Baby formula"]
  * Groceries, shopping, and household supplies:
    - "Buy milk, eggs, bread and butter." -> type: "list", title: "Grocery Shopping", checklist: ["Milk", "Eggs", "Bread", "Butter"]
    - "I need to get macaroni and cheese, peanut butter and jelly, and bananas." -> type: "list", title: "Grocery Shopping", checklist: ["Macaroni and cheese", "Peanut butter and jelly", "Bananas"] (NEVER split compound names like "macaroni and cheese" on "and"!)
  * Packing and travel:
    - "Things to pack for my trip: clothes, shoes, toothbrush, charger and passport." -> type: "list", title: "Packing List", checklist: ["Clothes", "Shoes", "Toothbrush", "Charger", "Passport"]
  * Multi-step tasks or errands (without specific times):
    - "Things to do today: clean the kitchen, vacuum the living room, and wash the car." -> type: "list", title: "Daily Chores", checklist: ["Clean the kitchen", "Vacuum the living room", "Wash the car"]
- CRITICAL RULES FOR LISTS:
  * NEVER classify an enumeration of 2 or more physical items, supplies, components, or tasks as a note, even if the user didn't explicitly say the word "list" or "buy"!
  * Exclude introductory/background context from the checklist (e.g. "I already booked the hotel. For the trip bring sunglasses and sunscreen" -> checklist is only ["Sunglasses", "Sunscreen"]).
  * Preserve compound items intact ("macaroni and cheese", "salt and pepper", "fish and chips").

2. "reminder":
- MUST be chosen when the input specifies an actionable task or obligation attached to a SPECIFIC date, time, relative delay, or recurring schedule.
- Examples of reminders:
  * "Remind me to call the doctor tomorrow at 3pm." -> type: "reminder", dueDateLocal: "YYYY-MM-DDTHH:mm:ss"
  * "Pay the electricity bill on 5th December at 9am." -> type: "reminder"
  * "Take blood pressure medication every day at 8am." -> type: "reminder", recurrenceMode: "daily"
  * "Meeting with Alex in 2 hours." -> type: "reminder"
- If the input contains MULTIPLE distinct reminders with separate times (e.g. "Call mom at 11am and meet accountant tomorrow at 4pm"), set type: "reminder", fill "multipleReminders" with each reminder, and set the first one in the top-level fields.

3. "note":
- MUST be chosen for informational statements, meeting summaries/agendas, journal reflections, learning notes, or general ideas that DO NOT specify multiple checklist items and DO NOT have a specific reminder due date/time.
- Examples of notes:
  * "Our next team meeting will focus on improving mobile responsiveness and fixing authentication issues." -> type: "note", title: "Team Meeting Focus", content: "Our next team meeting will focus on improving mobile responsiveness and fixing authentication issues."
  * "Today I learned that React 19 server actions simplify asynchronous mutations." -> type: "note", title: "React 19 Server Actions"
  * "Idea for a project: a personal finance manager that tracks recurring subscriptions." -> type: "note", title: "Project Idea"
  * "Today was a productive day and we closed two client deals." -> type: "note", title: "Daily Reflection"
- CRITICAL RULES FOR NOTES:
  * A note NEVER contains a checklist of items.
  * Commas or the word "and" in a general sentence (e.g. "learning React and Node.js") do NOT make it a list unless multiple distinct physical items, supplies, or discrete tasks are being enumerated.

============================================================
2. OUTPUT FORMAT
============================================================
Return a valid JSON object matching the requested schema. Ensure:
- "title": Clean, concise title (2-6 words).
- "content": Full description or body text.
- "checklist": Array of strings for lists (empty array if not a list).
- "dueDateLocal": "YYYY-MM-DDTHH:mm:ss" for reminders (null/omitted if not a reminder).
- "teamName": Spoken/written team destination if user specified a team (e.g. "for Marketing team", "in Engineering"), else null.`;
}

/**
 * Calls Gemini 2.5 Flash to process audio or text and returns guaranteed structured JSON.
 */
export async function processWithGemini(options: {
  apiKey: string;
  text?: string;
  audioBuffer?: Buffer | Uint8Array;
  audioMimeType?: string;
  userLocalDate: string;
  userDayName: string;
  userTimezone: string;
}): Promise<GeminiStructuredOutput> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });

  const systemInstruction = buildGeminiSystemInstruction({
    userLocalDate: options.userLocalDate,
    userDayName: options.userDayName,
    userTimezone: options.userTimezone,
  });

  const contents: Array<string | { inlineData: { mimeType: string; data: string } }> = [];

  if (options.audioBuffer && options.audioBuffer.byteLength > 0) {
    const base64Data = Buffer.from(options.audioBuffer).toString("base64");
    contents.push({
      inlineData: {
        mimeType: options.audioMimeType || "audio/webm",
        data: base64Data,
      },
    });
  }

  if (options.text && options.text.trim()) {
    contents.push(options.text.trim());
  } else if (contents.length === 0) {
    throw new Error("No text or audio provided to Gemini");
  }

  const candidateModels = [
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
  ];

  let lastError: Error | null = null;
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        continue;
      }

      const parsed = JSON.parse(responseText) as GeminiStructuredOutput;
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[AI] Gemini model ${model} failed, trying next...:`, lastError.message);
    }
  }

  throw lastError || new Error("All Gemini models failed");
}
