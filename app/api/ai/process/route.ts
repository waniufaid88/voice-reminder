import { NextRequest, NextResponse } from "next/server";
import {
  parseNaturalReminder,
  parseMultipleReminders,
  cleanReminderTitle,
  cleanReminderContent,
} from "@/lib/natural-date-parser";
import { parseLocalDatetime } from "@/lib/date-utils";
import { convexServer } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  matchTeamDestination,
  cleanTeamDestinationText,
  TeamInfo,
} from "@/lib/team-matcher";
import {
  processWithGemini,
  buildGeminiSystemInstruction,
  GeminiStructuredOutput,
} from "@/lib/gemini";

const GROQ_API_URL = "https://api.groq.com/openai/v1";
const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";

type ItemType = "note" | "reminder" | "list";
type RecurrenceMode = "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

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
  teamId?: string | null;
  teamName?: string | null;
  isTeamAmbiguous?: boolean;
  ambiguousTeams?: TeamInfo[];
};

function getAudioMimeAndExt(
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

function resolveTeam(
  rawText: string,
  suggestedTeamName: string | null | undefined,
  userTeams: TeamInfo[]
): {
  detectedTeamId: string | null;
  detectedTeamName: string | null;
  isTeamAmbiguous: boolean;
  ambiguousTeams: TeamInfo[];
} {
  if (userTeams.length === 0) {
    return {
      detectedTeamId: null,
      detectedTeamName: null,
      isTeamAmbiguous: false,
      ambiguousTeams: [],
    };
  }

  if (suggestedTeamName) {
    const match = matchTeamDestination(suggestedTeamName, userTeams);
    if (match.teamId || match.isAmbiguous) {
      return {
        detectedTeamId: match.teamId,
        detectedTeamName: match.teamName,
        isTeamAmbiguous: match.isAmbiguous,
        ambiguousTeams: match.ambiguousTeams,
      };
    }
  }

  const fallbackMatch = matchTeamDestination(rawText, userTeams);
  return {
    detectedTeamId: fallbackMatch.teamId,
    detectedTeamName: fallbackMatch.teamName,
    isTeamAmbiguous: fallbackMatch.isAmbiguous,
    ambiguousTeams: fallbackMatch.ambiguousTeams,
  };
}

function formatStructuredOutput(
  parsed: GeminiStructuredOutput,
  rawText: string,
  clientTimezoneOffset: number | undefined,
  refDate: Date,
  userTeams: TeamInfo[]
): {
  finalItem: FormattedItem;
  formattedItems: FormattedItem[];
} {
  // If list: checklist items must be populated and must remain personal
  if (parsed.type === "list") {
    const checklist: ChecklistItem[] = (parsed.checklist || [])
      .map((itemText) => ({
        id: crypto.randomUUID(),
        text: itemText.trim(),
        completed: false,
      }))
      .filter((c) => c.text.length > 0);

    const finalItem: FormattedItem = {
      type: "list",
      title: parsed.title || "Checklist",
      content: parsed.content || parsed.title || "Checklist",
      checklist,
      isDaily: false,
      recurrenceMode: "once",
      tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : ["#list"],
      teamId: null,
      teamName: null,
      isTeamAmbiguous: false,
      ambiguousTeams: [],
    };
    return { finalItem, formattedItems: [] };
  }

  // If note: must remain personal
  if (parsed.type === "note") {
    const finalItem: FormattedItem = {
      type: "note",
      title: parsed.title || "Note",
      content: parsed.content || rawText || "Note",
      checklist: undefined,
      isDaily: false,
      recurrenceMode: "once",
      tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : ["#note"],
      teamId: null,
      teamName: null,
      isTeamAmbiguous: false,
      ambiguousTeams: [],
    };
    return { finalItem, formattedItems: [] };
  }

  // If reminder: can be single or multiple
  const teamResult = resolveTeam(rawText, parsed.teamName, userTeams);

  // Check for multiple reminders
  if (Array.isArray(parsed.multipleReminders) && parsed.multipleReminders.length > 1) {
    const formattedItems: FormattedItem[] = parsed.multipleReminders.map((r) => {
      let dueDate: number | undefined;
      if (r.dueDateLocal) {
        try {
          dueDate = parseLocalDatetime(r.dueDateLocal, clientTimezoneOffset);
        } catch { }
      }
      let title = cleanReminderTitle(r.title || "Reminder");
      let content = cleanReminderContent(r.content || title);
      if (teamResult.detectedTeamName) {
        title = cleanTeamDestinationText(title, teamResult.detectedTeamName);
        content = cleanTeamDestinationText(content, teamResult.detectedTeamName);
      }
      const recurrenceMode = (r.recurrenceMode || "once") as RecurrenceMode;
      return {
        type: "reminder",
        title,
        content,
        dueDate,
        dueDateLocal: r.dueDateLocal,
        recurrenceMode,
        recurrenceDays: r.recurrenceDays,
        isDaily: recurrenceMode === "daily",
        tags: ["#reminder", "#task"],
        teamId: teamResult.detectedTeamId,
        teamName: teamResult.detectedTeamName,
        isTeamAmbiguous: teamResult.isTeamAmbiguous,
        ambiguousTeams: teamResult.ambiguousTeams,
      };
    });

    return { finalItem: formattedItems[0], formattedItems };
  }

  // Single reminder
  let dueDate: number | undefined;
  let dueDateLocal = parsed.dueDateLocal || undefined;
  if (dueDateLocal) {
    try {
      dueDate = parseLocalDatetime(dueDateLocal, clientTimezoneOffset);
    } catch { }
  }

  if (!dueDate || !Number.isFinite(dueDate)) {
    const natural = parseNaturalReminder(rawText, refDate, clientTimezoneOffset);
    if (natural.dueDate) {
      dueDate = natural.dueDate;
      dueDateLocal = natural.dueDateLocal;
    }
  }

  let title = cleanReminderTitle(parsed.title || "Reminder");
  let content = cleanReminderContent(parsed.content || title);
  if (teamResult.detectedTeamName) {
    title = cleanTeamDestinationText(title, teamResult.detectedTeamName);
    content = cleanTeamDestinationText(content, teamResult.detectedTeamName);
  }

  const recurrenceMode = (parsed.recurrenceMode || "once") as RecurrenceMode;
  const finalItem: FormattedItem = {
    type: "reminder",
    title,
    content,
    dueDate,
    dueDateLocal,
    recurrenceMode,
    recurrenceDays: parsed.recurrenceDays,
    isDaily: recurrenceMode === "daily",
    tags: parsed.tags && parsed.tags.length > 0 ? parsed.tags : ["#reminder", "#task"],
    teamId: teamResult.detectedTeamId,
    teamName: teamResult.detectedTeamName,
    isTeamAmbiguous: teamResult.isTeamAmbiguous,
    ambiguousTeams: teamResult.ambiguousTeams,
  };

  return { finalItem, formattedItems: [] };
}

export async function POST(req: NextRequest) {
  const geminiApiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY
  )?.trim();
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const contentType = req.headers.get("content-type") || "";

  let rawText = "";
  let fallbackText = "";

  let clientTimezone = "";
  let clientTimezoneOffset: number | undefined;
  let clientNowISO = "";
  let clientNowLocal = "";

  let userTeams: TeamInfo[] = [];
  let userIdRaw: string | undefined;

  let audioBytes: Uint8Array | null = null;
  let audioMimeType = "audio/webm";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as Blob | null;

      fallbackText = (formData.get("fallbackText") as string) || "";
      clientTimezone = (formData.get("clientTimezone") as string) || "";
      clientNowISO = (formData.get("clientNowISO") as string) || "";
      clientNowLocal = (formData.get("clientNowLocal") as string) || "";
      userIdRaw = (formData.get("userId") as string) || undefined;

      const teamsRaw = formData.get("teams") as string | null;
      if (teamsRaw) {
        try {
          const parsed = JSON.parse(teamsRaw);
          if (Array.isArray(parsed)) {
            userTeams = parsed;
          }
        } catch { }
      }

      const offsetRaw = formData.get("clientTimezoneOffset");
      if (offsetRaw !== null && offsetRaw !== "") {
        const parsedOffset = Number(offsetRaw);
        if (Number.isFinite(parsedOffset)) {
          clientTimezoneOffset = parsedOffset;
        }
      }

      if (audioFile) {
        const { mime } = getAudioMimeAndExt(
          audioFile.type,
          (audioFile as File).name
        );
        audioMimeType = mime;
        audioBytes = new Uint8Array(await audioFile.arrayBuffer());
      }
    } else {
      const json = await req.json();
      rawText = json.text || "";
      clientTimezone = json.clientTimezone || "";
      clientNowISO = json.clientNowISO || "";
      clientNowLocal = json.clientNowLocal || "";
      userIdRaw = json.userId || undefined;

      if (Array.isArray(json.teams)) {
        userTeams = json.teams;
      } else if (typeof json.teams === "string") {
        try {
          userTeams = JSON.parse(json.teams);
        } catch { }
      }

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

    // Resolve user teams if userId provided but teams list empty
    if (userTeams.length === 0 && userIdRaw) {
      try {
        const dbTeams = await convexServer.query(api.teams.getUserTeamsList, {
          userId: userIdRaw as Id<"users">,
        });
        if (dbTeams && dbTeams.length > 0) {
          userTeams = dbTeams.map((t) => ({ id: String(t._id), name: t.name }));
        }
      } catch (err) {
        console.warn("[AI] Could not fetch teams for user:", err);
      }
    }

    const parsedClientDate = clientNowISO ? new Date(clientNowISO) : new Date();
    const refDate = Number.isNaN(parsedClientDate.getTime())
      ? new Date()
      : parsedClientDate;

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const userDayName = dayNames[refDate.getDay()];
    const userLocalDate = clientNowLocal || refDate.toLocaleString();
    const userTimezone = clientTimezone || "User Local Time";

    let structuredOutput: GeminiStructuredOutput | null = null;
    let aiEngineUsed = "";

    // PRIMARY ENGINE: Gemini 2.5 Flash
    if (geminiApiKey) {
      try {
        console.log("[AI] Processing with Gemini API...");
        structuredOutput = await processWithGemini({
          apiKey: geminiApiKey,
          text: rawText || fallbackText || undefined,
          audioBuffer: audioBytes && audioBytes.byteLength > 0 ? audioBytes : undefined,
          audioMimeType,
          userLocalDate,
          userDayName,
          userTimezone,
        });
        aiEngineUsed = "gemini";
        if (!rawText && structuredOutput.content) {
          rawText = structuredOutput.content;
        }
      } catch (geminiError) {
        console.error("[AI] Gemini API error:", geminiError);
      }
    }

    // FALLBACK ENGINE: Groq (using improved prompt and Whisper if audio)
    if (!structuredOutput && groqApiKey) {
      try {
        console.log("[AI] Falling back to Groq API with improved prompt...");
        let textToStructure = rawText;

        if (!textToStructure && audioBytes && audioBytes.byteLength > 0) {
          const file = new File([Buffer.from(audioBytes)], "recording.webm", {
            type: audioMimeType,
          });
          const transcriptionFormData = new FormData();
          transcriptionFormData.append("file", file);
          transcriptionFormData.append("model", GROQ_TRANSCRIPTION_MODEL);
          transcriptionFormData.append("response_format", "json");

          const transcriptionRes = await fetch(
            `${GROQ_API_URL}/audio/transcriptions`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${groqApiKey}` },
              body: transcriptionFormData,
            }
          );

          if (transcriptionRes.ok) {
            const transcriptionData = await transcriptionRes.json();
            textToStructure = (transcriptionData.text || "").trim();
            rawText = textToStructure;
          }
        }

        if (!textToStructure && fallbackText.trim()) {
          textToStructure = fallbackText.trim();
          rawText = textToStructure;
        }

        if (textToStructure) {
          const systemInstruction = buildGeminiSystemInstruction({
            userLocalDate,
            userDayName,
            userTimezone,
          });

          const chatRes = await fetch(`${GROQ_API_URL}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${groqApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: GROQ_CHAT_MODEL,
              messages: [
                {
                  role: "system",
                  content: `${systemInstruction}\n\nIMPORTANT: You must respond ONLY with valid JSON conforming to the requested format.`,
                },
                { role: "user", content: textToStructure },
              ],
              temperature: 0.1,
              response_format: { type: "json_object" },
            }),
          });

          if (chatRes.ok) {
            const chatData = await chatRes.json();
            const contentStr = chatData.choices?.[0]?.message?.content?.trim();
            if (contentStr) {
              structuredOutput = JSON.parse(contentStr);
              aiEngineUsed = "groq";
            }
          }
        }
      } catch (groqError) {
        console.error("[AI] Groq fallback error:", groqError);
      }
    }

    // OFFLINE / DETERMINISTIC FALLBACK if both AI calls failed or unavailable
    if (!structuredOutput) {
      console.log("[AI] Using deterministic offline fallback...");
      const textToParse = rawText || fallbackText || "Untitled";

      // Check for multi-reminders first
      const multi = parseMultipleReminders(
        textToParse,
        refDate,
        clientTimezoneOffset
      );

      if (multi && multi.length > 1) {
        structuredOutput = {
          type: "reminder",
          title: multi[0].title || "Reminder",
          content: multi[0].title || "Reminder",
          dueDateLocal: multi[0].dueDateLocal,
          multipleReminders: multi.map((m) => ({
            title: m.title || "Reminder",
            dueDateLocal: m.dueDateLocal || "",
            recurrenceMode: m.recurrenceMode,
            recurrenceDays: m.recurrenceDays,
          })),
        };
      } else {
        const natural = parseNaturalReminder(
          textToParse,
          refDate,
          clientTimezoneOffset
        );

        if (natural.isReminder) {
          structuredOutput = {
            type: "reminder",
            title: natural.title || "Reminder",
            content: natural.title || textToParse,
            dueDateLocal: natural.dueDateLocal,
            recurrenceMode: natural.recurrenceMode,
            recurrenceDays: natural.recurrenceDays,
          };
        } else {
          // Check for kit/list pattern
          const isListPattern =
            /\b(?:with|kit|essentials|supplies|ingredients|pack|checklist|list)\b/i.test(
              textToParse
            ) && textToParse.includes(",");

          if (isListPattern) {
            const parts = textToParse
              .split(/[:,]|\band\b/i)
              .map((p) => p.trim())
              .filter((p) => p.length > 1);

            structuredOutput = {
              type: "list",
              title: "Checklist",
              content: textToParse,
              checklist: parts.slice(1),
            };
          } else {
            structuredOutput = {
              type: "note",
              title: "Note",
              content: textToParse,
            };
          }
        }
      }
      aiEngineUsed = "offline-fallback";
    }

    const { finalItem, formattedItems } = formatStructuredOutput(
      structuredOutput,
      rawText || fallbackText || "",
      clientTimezoneOffset,
      refDate,
      userTeams
    );

    return NextResponse.json({
      ...finalItem,
      items: formattedItems.length > 1 ? formattedItems : undefined,
      rawTranscription: rawText || fallbackText || undefined,
      aiEngine: aiEngineUsed,
    });
  } catch (error) {
    console.error("[AI] Process route error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Processing failed",
      },
      { status: 500 }
    );
  }
}
