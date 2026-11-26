
import { NextRequest, NextResponse } from "next/server";

import {
  parseNaturalReminder,
  parseMultipleReminders,
  cleanReminderTitle,
  cleanReminderContent,
  generateSmartListInfo,
  generateSmartNoteInfo,
} from "@/lib/natural-date-parser";
import {
  cleanChecklistItem,
  splitChecklistItems,
  isIntroductoryContext,
  isNonItemSentence,
} from "@/lib/checklist-cleaner";

import { parseLocalDatetime } from "@/lib/date-utils";
import { convexServer } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  matchTeamDestination,
  cleanTeamDestinationText,
  TeamInfo,
} from "@/lib/team-matcher";

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
  teamId?: string | null;
  teamName?: string | null;
  isTeamAmbiguous?: boolean;
  ambiguousTeams?: TeamInfo[];
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
    /\b(?:set|schedule|create)\s+(?:a\s+)?(?:reminder|alarm)\b/.test(text) ||
    /\b(?:don't|do\s+not)\s+let\s+me\s+forget\b/.test(text) ||
    /\b(?:alert|notify|ping|wake)\s+me\b/.test(text) ||
    /\b(?:due\s+date|reminder\s+for)\b/.test(text)
  );
}

/**
 * Detect list intent without treating every sentence
 * containing "and" or commas as a list.
 */
function hasExplicitListIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim();

  // Exclude explicit learning goals, opinions, thoughts, or ideas
  if (
    /\b(?:want|need|plan)\s+to\s+learn\b/i.test(text) ||
    /\b(?:learning\s+goal|my\s+idea\s+is|thought\s+about|learned\s+that|learned\s+about)\b/i.test(text)
  ) {
    return false;
  }

  const patterns = [
    // Shopping, purchasing, and needing items/commodities:
    /\b(?:buy|purchase|pick\s+up)\b/,
    /\b(?:need|have|want)\s+to\s+(?:buy|get|purchase|pick\s+up)\b/,
    /\b(?:i|we)?\s*(?:need|needs|want|wants)\b.+?(?:,|\band\b)/, // e.g. "I need 2 liters of milk, a dozen eggs, and 500g sugar"
    /\b(?:shopping|grocery)\s+list\b/,

    // Quantity / measurement units common in shopping lists:
    /\b(?:\d+\s*(?:liters?|litres?|kg|kilos?|grams?|g|pounds?|lbs?|bottles?|cans?|packs?|boxes?|packets?|pieces?)|a\s+dozen)\b/,

    // Packing and travel items:
    /\b(?:pack|bring)\b/,
    /\bthings?\s+to\s+pack\b/,
    /\bitems?\s+to\s+pack\b/,
    /\bpacking\s+list\b/,
    /\bthings?\s+to\s+bring\b/,
    /\b(?:shirts?|pants?|jeans?|t-shirts?|socks?|shoes?|chargers?|passports?|clothes|undergarments?|jackets?|suitcases?|luggage|toiletries)\b/,

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

  if (patterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Comma-separated commodity/grocery/packing/supplies lists without verbs:
  const commodityKeywordPattern =
    /\b(?:milk|eggs?|bread|butter|sugar|produce|vegetables?|fruits?|soap|shampoo|toothpaste|toothbrushes?|cheese|macaroni|paneer|curd|yogurt|tea|coffee|rice|flour|oil|salt|spices?|biscuits?|onions?|potatoes?|tomatoes?|apples?|bananas?|oranges?|chicken|meat|fish|curtains?|bedsheets?|pillows?|dustbins?|detergents?|cleaners?|brooms?|mops?|shirts?|jeans?|socks?|shoes?|chargers?|passports?|notebooks?|pens?|pencils?)\b/i;
  if (commodityKeywordPattern.test(text) && splitChecklistItems(rawText).length >= 2) {
    return true;
  }

  return false;
}

/**
 * Deterministically extract items from sentences like:
 * "Add notebook, pen and pencil to my school supplies list."
 * "Put milk, eggs and bread in my grocery list."
 * "Add macaroni and cheese to my shopping list."
 *
 * Uses splitChecklistItems to protect compound items like "macaroni and cheese"
 * and preserve quantities and complete item descriptions.
 */
function extractItemsFromAddToList(
  rawText: string
): { title: string; items: ChecklistItem[] } | null {
  const match = rawText.match(
    /^\s*(?:please\s+)?(?:add|put|include)\s+(.+?)\s+(?:to|in|on)\s+(?:(?:my|the)\s+)?(?:(.+?)\s+)?(?:lists?|checklists?)\s*[.!?]*$/i
  );

  if (!match) return null;

  const rawItems = match[1]?.trim();
  const rawListName = match[2]?.trim() || "";

  if (!rawItems) return null;

  const extracted = splitChecklistItems(rawItems);
  if (extracted.length === 0) return null;

  let title = "Shopping List";
  if (rawListName) {
    title = rawListName
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return {
    title,
    items: extracted.map((item, index) => ({
      id: String(index + 1),
      text: item,
      completed: false,
    })),
  };
}

/**
 * Validate and clean checklist items returned by Groq or the rule-based parser.
 * Filters out introductory context statements ("Today I have to go market"),
 * past activities ("I went to the supermarket yesterday"),
 * background context ("This weekend I am cleaning my house"),
 * and strips conversational preambles ("I have to buy", "buy", "then I have buy")
 * while preserving genuine items and quantities.
 */
function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];

  const rawTexts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      rawTexts.push(item);
    } else if (item && typeof item === "object") {
      const entry = item as Record<string, unknown>;
      if (entry.text) rawTexts.push(String(entry.text));
    }
  }

  const flattened: string[] = [];
  for (const text of rawTexts) {
    if (isNonItemSentence(text)) {
      continue;
    }
    const split = splitChecklistItems(text);
    if (split.length > 0) {
      for (const s of split) {
        if (!isNonItemSentence(s)) {
          flattened.push(s);
        }
      }
    } else {
      const cleaned = cleanChecklistItem(text);
      if (cleaned && !isNonItemSentence(cleaned)) {
        flattened.push(cleaned);
      }
    }
  }

  return flattened.map((text, index) => ({
    id: String(index + 1),
    text,
    completed: false,
  }));
}

/**
 * Reconciles the AI-generated checklist with the deterministic rule-based checklist.
 * - Discards any items that originated exclusively from past activities or non-item sentences.
 * - Replaces split compound item fragments with the complete compound item (e.g. "Macaroni" + "Cheese" -> "Macaroni and cheese").
 * - Recovers any valid items from the rule-based extractor that the AI missed.
 * - Sorts items according to their original position of appearance in rawText to preserve speech order.
 * - Deduplicates items case-insensitively.
 */
function reconcileChecklists(
  aiChecklist: ChecklistItem[],
  ruleChecklist: ChecklistItem[],
  rawText: string
): ChecklistItem[] {
  if (aiChecklist.length === 0) {
    return ruleChecklist;
  }
  if (ruleChecklist.length === 0) {
    return aiChecklist.filter((it) => !isNonItemSentence(it.text));
  }

  // 1. Identify non-item sentences (past activities, background context) in rawText
  const nonItemSentences: string[] = [];
  const textWithDecimals = rawText.replace(/(\d+)\.(\d+)/g, "$1__DOT__$2");
  const sentences = textWithDecimals
    .split(/(?:[.!?;:\n]+|\s+--\s+)/)
    .map((s) => s.replace(/__DOT__/g, ".").trim())
    .filter(Boolean);

  for (const s of sentences) {
    if (isNonItemSentence(s)) {
      nonItemSentences.push(s.toLowerCase());
    }
  }

  const actionableSentences = sentences
    .filter((s) => !isNonItemSentence(s))
    .map((s) => s.toLowerCase());

  const validAiItems: ChecklistItem[] = [];
  for (const aiItem of aiChecklist) {
    const itemText = aiItem.text.trim();
    if (!itemText || isNonItemSentence(itemText)) continue;

    const lowerItem = itemText.toLowerCase();

    // If an item appears ONLY in non-item sentences (and NOT in any actionable sentence), discard it!
    const inActionable = actionableSentences.some((s) => s.includes(lowerItem));
    const inNonItem = nonItemSentences.some((s) => s.includes(lowerItem));

    if (inNonItem && !inActionable && nonItemSentences.length > 0) {
      continue;
    }

    validAiItems.push(aiItem);
  }

  // 2. Check for compound items from ruleChecklist that AI might have split
  const mergedItems: { text: string; rawIndex: number }[] = [];
  const coveredRuleIndices = new Set<number>();
  const replacedAiIndices = new Set<number>();

  for (let rIdx = 0; rIdx < ruleChecklist.length; rIdx++) {
    const ruleItem = ruleChecklist[rIdx];
    const ruleText = ruleItem.text;
    const lowerRule = ruleText.toLowerCase();

    const isCompound = /\b(?:and|&)\b/i.test(ruleText);
    if (isCompound) {
      const matchedAiIndices: number[] = [];
      const parts = ruleText.split(/\s+(?:and|&)\s+/i).map((p) => p.trim().toLowerCase());
      for (let aIdx = 0; aIdx < validAiItems.length; aIdx++) {
        const lowerAi = validAiItems[aIdx].text.toLowerCase();
        if (parts.some((p) => lowerAi === p || lowerAi.includes(p))) {
          matchedAiIndices.push(aIdx);
        }
      }

      if (matchedAiIndices.length >= 2) {
        matchedAiIndices.forEach((idx) => replacedAiIndices.add(idx));
        coveredRuleIndices.add(rIdx);
        const rawIndex = rawText.toLowerCase().indexOf(lowerRule);
        mergedItems.push({ text: ruleText, rawIndex: rawIndex !== -1 ? rawIndex : 9999 });
      }
    }
  }

  // 3. Add AI items (except those replaced by compound items)
  for (let aIdx = 0; aIdx < validAiItems.length; aIdx++) {
    if (replacedAiIndices.has(aIdx)) continue;
    const aiItem = validAiItems[aIdx];
    const lowerAi = aiItem.text.toLowerCase();
    const rawIndex = rawText.toLowerCase().indexOf(lowerAi);

    mergedItems.push({
      text: aiItem.text,
      rawIndex: rawIndex !== -1 ? rawIndex : 9999 + aIdx,
    });

    for (let rIdx = 0; rIdx < ruleChecklist.length; rIdx++) {
      const lowerRule = ruleChecklist[rIdx].text.toLowerCase();
      if (
        lowerAi === lowerRule ||
        lowerAi.includes(lowerRule) ||
        lowerRule.includes(lowerAi)
      ) {
        coveredRuleIndices.add(rIdx);
      }
    }
  }

  // 4. Recover any rule items that AI completely missed!
  for (let rIdx = 0; rIdx < ruleChecklist.length; rIdx++) {
    if (coveredRuleIndices.has(rIdx)) continue;
    const ruleItem = ruleChecklist[rIdx];
    const lowerRule = ruleItem.text.toLowerCase();
    const rawIndex = rawText.toLowerCase().indexOf(lowerRule);

    mergedItems.push({
      text: ruleItem.text,
      rawIndex: rawIndex !== -1 ? rawIndex : 9999 + rIdx,
    });
  }

  // 5. Sort merged items by their position of appearance in rawText to preserve original order
  mergedItems.sort((a, b) => a.rawIndex - b.rawIndex);

  // 6. Deduplicate case-insensitively
  const seen = new Set<string>();
  const finalResults: ChecklistItem[] = [];

  for (const item of mergedItems) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    finalResults.push({
      id: String(finalResults.length + 1),
      text: item.text.trim(),
      completed: false,
    });
  }

  return finalResults.length > 0 ? finalResults : ruleChecklist;
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
  clientTimezoneOffset?: number,
  userTeams: TeamInfo[] = []
) {
  const natural = parseNaturalReminder(
    rawText,
    refDate,
    clientTimezoneOffset
  );

  const teamMatch =
    userTeams.length > 0
      ? matchTeamDestination(rawText, userTeams)
      : { teamId: null, teamName: null, isAmbiguous: false, ambiguousTeams: [] };

  const reminderIntent =
    hasExplicitReminderIntent(rawText) ||
    (natural.isReminder && (Boolean(natural.detectedTime) || Boolean(natural.dueDate))) ||
    (teamMatch.teamId !== null && natural.isReminder);

  const listIntent =
    !reminderIntent && hasExplicitListIntent(rawText);

  // Reminder priority.
  if (reminderIntent) {
    let teamId: string | null = teamMatch.teamId;
    let teamName: string | null = teamMatch.teamName;
    let isTeamAmbiguous = teamMatch.isAmbiguous;
    let ambiguousTeams: TeamInfo[] = teamMatch.ambiguousTeams;

    const multiple = formatRuleBasedReminders(
      rawText,
      refDate,
      clientTimezoneOffset
    );

    if (multiple.length > 1) {
      const multiWithTeam = multiple.map((it) => {
        let cleanTitle = it.title;
        let cleanContent = it.content || it.title;
        if (teamName) {
          cleanTitle = cleanTeamDestinationText(cleanTitle, teamName);
          cleanContent = cleanTeamDestinationText(cleanContent, teamName);
        }
        return {
          ...it,
          title: cleanTitle,
          content: cleanContent,
          teamId,
          teamName,
          isTeamAmbiguous,
          ambiguousTeams,
        };
      });

      const primaryContent = teamName
        ? cleanTeamDestinationText(cleanReminderContent(rawText), teamName)
        : cleanReminderContent(rawText);

      return {
        type: "reminder" as const,
        title: multiWithTeam[0].title,
        content: primaryContent,
        dueDate: multiWithTeam[0].dueDate,
        dueDateLocal: multiWithTeam[0].dueDateLocal,
        recurrenceMode: multiWithTeam[0].recurrenceMode,
        recurrenceDays: multiWithTeam[0].recurrenceDays,
        isDaily: false,
        checklist: undefined,
        tags: ["#reminder"],
        teamId,
        teamName,
        isTeamAmbiguous,
        ambiguousTeams,
        items: multiWithTeam,
      };
    }

    let finalTitle = natural.title || cleanReminderTitle(rawText);
    let finalContent = cleanReminderContent(rawText);

    if (teamName) {
      finalTitle = cleanTeamDestinationText(finalTitle, teamName);
      finalContent = cleanTeamDestinationText(finalContent, teamName);
    }

    const reminderItem: FormattedItem = {
      type: "reminder",
      title: finalTitle,
      content: finalContent,
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
      teamId,
      teamName,
      isTeamAmbiguous,
      ambiguousTeams,
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

  let userTeams: TeamInfo[] = [];
  let userIdRaw: string | undefined;

  try {
    // STEP 1: Get text from audio or direct text input.

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

    // Fallback: If teams weren't in the request payload but userId is available, fetch from Convex
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

    const teamMatch =
      userTeams.length > 0
        ? matchTeamDestination(rawText, userTeams)
        : { teamId: null, teamName: null, isAmbiguous: false, ambiguousTeams: [] };

    const reminderIntent =
      hasExplicitReminderIntent(rawText) ||
      (natural.isReminder && (Boolean(natural.detectedTime) || Boolean(natural.dueDate))) ||
      (teamMatch.teamId !== null && natural.isReminder);

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
- The user explicitly says "remind me", "set a reminder", "alert me", or "don't let me forget".
- The user expresses an actionable task, future commitment, or obligation paired with a date or time, even without saying "remind me" (e.g. "I will call my friend at 11am", "I have to call my friend at 10 am", "Call my friend tomorrow at 5pm", "I have to submit my assignment tomorrow", "Meet my friend on 5th December at 3pm", "Pay the electricity bill on 1st January", "In Test Reminder, call my friend at 10am").
- The user specifies an appointment, meeting, task or activity with a date or time.
- The user specifies a relative time such as after 30 minutes or in two hours.
- The user specifies a recurrence such as every day.

Examples:

"I will call my friend at 11am."
=> reminder, 11:00
Title: "Call My Friend"

"I have to call my friend at 10 am."
=> reminder, 10:00
Title: "Call My Friend"

"Call my friend tomorrow at 5pm."
=> reminder, tomorrow 17:00
Title: "Call My Friend"

"I have to submit my assignment tomorrow."
=> reminder, tomorrow 09:00
Title: "Submit My Assignment"

"Meet my friend on 5th December at 3pm."
=> reminder, 5th December 15:00
Title: "Meet My Friend"

"Pay the electricity bill on 1st January."
=> reminder, 1st January 09:00
Title: "Pay The Electricity Bill"

"In Test Reminder, call my friend at 10am."
=> reminder, 10:00, team: Test Reminder
Title: "Call My Friend"

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
- A future actionable task, commitment, or obligation with a date or time is a REMINDER.
- If a date is specified without an explicit time (e.g. "Pay the electricity bill on 1st January", "I have to submit my assignment tomorrow"), classify it as a REMINDER and default the time to 09:00.
- Do NOT classify general statements describing meetings, events, agendas, or plans as reminders merely because they mention "meeting", "tomorrow", "next week", "upcoming", or future activities. If the user is simply recording information about a future event or meeting details (e.g. "Our next project meeting will focus on improving mobile responsiveness and fixing authentication issues."), classify it as a NOTE!
- Do not classify a general learning goal or a general thought as a reminder merely because it contains a timeframe:

"I want to learn Next.js this month."
=> note

====================================
2. LIST CLASSIFICATION
====================================

Classify as list when the user:
- States items, groceries, or supplies they need, want, or have to get (e.g. "I need 2 liters of milk, a dozen eggs, and 500g sugar", "We need milk, eggs and bread", "Need a bedsheet, pillow covers, curtains and a dustbin").
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

"I need 2 liters of milk, a dozen eggs, and 500g sugar."
=> list
Title: "Grocery Shopping"
Checklist: "2 liters of milk", "A dozen eggs", "500g sugar"
(Notice: The user expresses needed items with quantities. This is a shopping list, NOT a note!)

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

"My room is very messy. I need to buy a bedsheet, pillow covers, curtains and a dustbin."
=> list
Title: "Room Essentials"
Checklist: "Bedsheet", "Pillow covers", "Curtains", "Dustbin"
(Notice: "My room is very messy." is a state/condition/problem observation sentence. It is background context and must NEVER be added to the checklist! The items are the products: "Bedsheet", "Pillow covers", "Curtains", "Dustbin".)

"I am preparing dinner for my friends. First get vegetables, then buy paneer, spices, cream and bread."
=> list
Title: "Grocery Shopping"
Checklist: "Vegetables", "Paneer", "Spices", "Cream", "Bread"
(Notice: "I am preparing dinner for my friends." is occasion/event preparation context. It must NEVER be added to the checklist! The items are the ingredients: "Vegetables", "Paneer", "Spices", "Cream", "Bread".)

"On my way to the office, I need to drop my laptop for repair, collect my documents, buy coffee and pick up my parcel."
=> list
Title: "Daily Errands"
Checklist: "Drop my laptop for repair", "Collect my documents", "Buy coffee", "Pick up my parcel"
(Notice:
- "On my way to the office" is an introductory commute/location context clause, NOT a checklist item! It must NEVER be added to the checklist!
- For task-based checklists and errands, preserve the actionable task descriptions with their action verbs intact: "Drop my laptop for repair", "Collect my documents", "Buy coffee", "Pick up my parcel".)

"Today I have to go market, then I have to buy milk, apples, soap, and bag."
=> list
Title: "Grocery Shopping"
Checklist: "Milk", "Apples", "Soap", "Bag"
(Notice: "Today I have to go market" is an introductory travel/location statement, NOT an item! It must NEVER be added to the checklist!)

"I'm going to the supermarket, need to get 2 liters of milk, a dozen eggs, and 500g sugar."
=> list
Title: "Grocery Shopping"
Checklist: "2 liters of milk", "A dozen eggs", "500g sugar"
(Notice: "I'm going to the supermarket" is introductory context, excluded from the checklist.)

"I have several things to do today: first buy groceries, including milk and eggs, then visit the pharmacy to get medicine, and finally pick up my parcel."
=> list
Title: "Errands & Shopping"
Checklist: "Milk", "Eggs", "Medicine", "Pick up my parcel"
(Notice:
- "I have several things to do today:" is a meta-announcement, NOT an item.
- "buy groceries, including" is a category frame; the actual items are "Milk" and "Eggs".
- "visit the pharmacy to get medicine" is an errand action phrase; extract the actual target object "Medicine".
- "finally pick up my parcel" is an actionable task; extract "Pick up my parcel".)

"This weekend I am cleaning my house. I need to buy a broom, floor cleaner, detergent and garbage bags."
=> list
Title: "Cleaning Supplies"
Checklist: "Broom", "Floor cleaner", "Detergent", "Garbage bags"
(Notice: "This weekend I am cleaning my house." is a general background plan/context statement. It must NEVER be added to the checklist! The actual items are "Broom", "Floor cleaner", "Detergent", "Garbage bags".)

"I went to the supermarket yesterday, but today I need to buy only soap, shampoo and toothpaste."
=> list
Title: "Grocery Shopping"
Checklist: "Soap", "Shampoo", "Toothpaste"
(Notice: "I went to the supermarket yesterday" is an unrelated past activity. Past activities and contrast clauses must NEVER be extracted as checklist items!)

"Buy milk, eggs, bread"
=> list
Title: "Grocery Shopping"
Checklist: "Milk", "Eggs", "Bread"
(Notice: "Buy" is stripped, but the first item "Milk" is preserved. Never drop or skip genuine items!)

"I have already ordered the cake. For the birthday party, buy balloons, candles, snacks, drinks and paper plates."
=> list
Title: "Party Supplies"
Checklist: "Balloons", "Candles", "Snacks", "Drinks", "Paper plates"
(Notice:
- "I have already ordered the cake." is a completed activity. Completed activities (already ordered, bought, booked, finished) must NEVER be extracted as checklist items!
- "For the birthday party" is a purpose/occasion clause, NOT an item! It must NEVER be added to the checklist!
- The actual items to get are: "Balloons", "Candles", "Snacks", "Drinks", "Paper plates".)

"My bathroom needs cleaning supplies. Get shampoo, soap, toothpaste and a toothbrush."
=> list
Title: "Bathroom Supplies"
Checklist: "Shampoo", "Soap", "Toothpaste", "Toothbrush"
(Notice: "My bathroom needs cleaning supplies." is a need/condition observation sentence and must NEVER be added to the checklist! The items are "Shampoo", "Soap", "Toothpaste", "Toothbrush".)

"Buy macaroni and cheese, milk and bread."
=> list
Title: "Grocery Shopping"
Checklist: "Macaroni and cheese", "Milk", "Bread"
(Notice: "Macaroni and cheese" is a single compound product name and must NEVER be split on "and"! Other compound items like "peanut butter and jelly", "fish and chips", "bread and butter", "salt and pepper" must always be kept intact.)

"I am going on vacation next week. Pack shirts, jeans, socks, shoes and a charger."
=> list
Title: "Packing List"
Checklist: "Shirts", "Jeans", "Socks", "Shoes", "A charger"
(Notice: "I am going on vacation next week." is background travel context and must never be added as a checklist item! The items are "Shirts", "Jeans", "Socks", "Shoes", "A charger".)

"Yesterday I bought rice and sugar. Today I only need oil, flour, salt and tea."
=> list
Title: "Grocery Shopping"
Checklist: "Oil", "Flour", "Salt", "Tea"
(Notice: "Yesterday I bought rice and sugar." describes completed past activities. NEVER include previously purchased items! The items to get today are "Oil", "Flour", "Salt", "Tea".)

"Add 2 bottles of shampoo, 3 packets of biscuits and 1 kg of rice."
=> list
Title: "Grocery Shopping"
Checklist: "2 bottles of shampoo", "3 packets of biscuits", "1 kg of rice"
(Notice: Quantities, units, and complete item descriptions must ALWAYS be preserved intact!)

"I already have rice and sugar. Today I need oil, flour, salt and tea."
=> list
Title: "Grocery Shopping"
Checklist: "Oil", "Flour", "Salt", "Tea"
(Notice: "I already have rice and sugar." describes existing items already on hand. Existing/already possessed items must NEVER be extracted into the checklist! The items needed today are: "Oil", "Flour", "Salt", "Tea".)

"Prepare my gym bag with a towel, water bottle, sports shoes and headphones."
=> list
Title: "Gym Essentials"
Checklist: "Towel", "Water bottle", "Sports shoes", "Headphones"
(Notice: "Prepare my gym bag with" is a container packing instruction. Extract the items to put inside: "Towel", "Water bottle", "Sports shoes", "Headphones".)

"I need to clean my house. Get a broom, mop, floor cleaner, detergent and gloves."
=> list
Title: "Cleaning Supplies"
Checklist: "Broom", "Mop", "Floor cleaner", "Detergent", "Gloves"
(Notice: "I need to clean my house." is a general chore/goal statement and must NEVER be added to the checklist! The items to get are: "Broom", "Mop", "Floor cleaner", "Detergent", "Gloves".)

For lists:
- Generate a short, meaningful title matching the theme (e.g. "Bathroom Supplies" for bathroom items; "Packing List" for travel/vacation; "School Supplies" for school; "Cleaning Supplies" for house cleaning; "Grocery Shopping" for market and food groceries; "Room Essentials" for bedroom/home items; "Daily Errands" for to-dos on the go; "Shopping List" for general items).
- Understand the complete sentence structure before extracting items.
- NEVER split compound item names containing "and" or "&" (e.g. "Macaroni and cheese", "peanut butter and jelly", "bread and butter", "fish and chips", "salt and pepper").
- NEVER add introductory sentences, general context, travel statements, destinations, state/condition/need sentences (e.g. "My room is very messy", "My bathroom needs cleaning supplies", "The fridge is empty"), event/meal preparations (e.g. "I am preparing dinner for my friends"), travel plans (e.g. "I am going on vacation next week"), commute clauses (e.g. "On my way to the office"), or past activities (e.g. "Yesterday I bought rice and sugar") to the checklist.
- Support BOTH shopping lists and task-based checklists:
  * For shopping lists (buying products, groceries, supplies): extract clean product/commodity names without conversational preambles (e.g. "I need to buy a bedsheet, pillow covers, curtains and a dustbin" => "Bedsheet", "Pillow covers", "Curtains", "Dustbin"; "First get vegetables, then buy paneer, spices, cream and bread" => "Vegetables", "Paneer", "Spices", "Cream", "Bread").
  * For task-based checklists and errands (actions, errands, to-dos to perform): preserve actionable task descriptions with their action verbs intact (e.g. "On my way to the office, I need to drop my laptop for repair, collect my documents, buy coffee and pick up my parcel" => "Drop my laptop for repair", "Collect my documents", "Buy coffee", "Pick up my parcel"; "Wash clothes, clean the kitchen and vacuum the room" => "Wash clothes", "Clean the kitchen", "Vacuum the room").
- Put only genuine, individual items or actionable tasks in the checklist.
- Each checklist item must be separate.
- STRIP conversational preambles and sequence words (e.g. "first", "finally", "including", "such as", "I have to buy", "I need to", "I must", "then I have buy").
- If user uses transitional phrases like "then I have to buy pants" or "after that buy soap", split them into separate clean items ("Pants", "Soap").
- Preserve valid quantities and units (e.g. "2 bottles of shampoo", "3 packets of biscuits", "1 kg of rice", "2 liters of milk", "A dozen eggs", "500g sugar", "A charger").
- Do NOT combine background context with the first item.
- Do NOT blindly remove the first item. If the first phrase contains a genuine item (e.g. "Buy milk, eggs and bread" or "Milk, apples and soap"), PRESERVE the first item ("Milk").
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
- Informational statements and meeting details / agendas (e.g. what a meeting will focus on or discuss).
- Learning goals.
- Personal goals.
- General descriptions.

Examples:

"Our next project meeting will focus on improving mobile responsiveness and fixing authentication issues."
=> note
Title: "Project Meeting Focus"
Content: "Our next project meeting will focus on improving mobile responsiveness and fixing authentication issues."
(Notice: This is informational meeting detail/agenda recording. The user is recording what the meeting will focus on, NOT asking to be reminded! There is no "remind me" instruction. Therefore, it is a NOTE, NOT a reminder!)

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
- A statement listing needed groceries, products, supplies, or tasks (e.g. "I need 2 liters of milk, a dozen eggs, and 500g sugar", "Need bread and butter") is a LIST, NOT a note.
- Commas and "and" in a general thought or idea do not make it a list (e.g. "React hooks help us manage state and side effects" is a note).
- A learning goal is a note ("I want to learn Next.js, TypeScript and PostgreSQL").
- An idea is a note ("My idea is to build a personal finance application").
- A collection of actionable activities can be a list.
- When uncertain between a note and list, choose note.
- Explicit reminder intent takes priority over list intent.

====================================
4. MULTIPLE REMINDERS
====================================

If the user describes multiple distinct reminder tasks, return every task in items.

Examples:

"Call my friend at 11am, then go shopping at 2pm."
=> Return two separate reminders in items:
1. Title: "Call My Friend", 11:00
2. Title: "Go Shopping", 14:00

"Remind me to buy groceries tomorrow, pay the bill on Friday and visit the doctor on 5th December."
=> Return three separate reminders in items:
1. Title: "Buy Groceries", tomorrow 09:00
2. Title: "Pay The Bill", upcoming Friday 09:00
3. Title: "Visit The Doctor", 5th December 09:00

"Call my friend at 11 AM then go to the market at 1 PM and walk at 7 PM."
=> Return three separate reminders in items:
1. Title: "Call My Friend", 11:00
2. Title: "Go To The Market", 13:00
3. Title: "Walk", 19:00

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
8. TEAM DESTINATION FOR REMINDERS
====================================

${userTeams.length > 0
            ? `The user belongs to the following available teams:
${JSON.stringify(userTeams.map((t) => ({ id: t.id, name: t.name })))}

Rules for Team Selection:
1. ONLY apply team destination if the item is classified as a "reminder".
   Notes and lists are strictly personal: for notes and lists, ALWAYS return "teamId": null, "teamName": null, "isTeamAmbiguous": false, "ambiguousTeamIds": [].
2. If the user mentions one of the available teams as the destination or target of the reminder (e.g. "in <team>", "for <team>", "<team>: ...", "remind <team> to...", "remind me in <team> to...", "remind me to ... for team <team>"):
   - If the mention clearly matches exactly ONE team from the list:
     Set "teamId" to that team's id.
     Set "teamName" to that team's exact name.
     Set "isTeamAmbiguous" to false.
     Set "ambiguousTeamIds" to [].
     CRITICAL: Do NOT include the team name or team destination phrasing in the reminder's "title" or "content" (description). The team name must ONLY be used to identify the destination team. Both "title" and "content" must be clean task descriptions without the team name (e.g. "Remind Office to submit quarterly report" -> title: "Submit quarterly report", content: "Submit quarterly report", teamId: "<Office_id>").
   - If the mention is ambiguous between multiple available teams (for example, the user mentions "Office" and they belong to both "Office Marketing" and "Office Engineering"):
     Set "teamId": null.
     Set "teamName": the mentioned name.
     Set "isTeamAmbiguous": true.
     Set "ambiguousTeamIds": the ids of all matching candidate teams.
3. If the user does NOT mention an existing team name:
   Set "teamId": null, "teamName": null, "isTeamAmbiguous": false, "ambiguousTeamIds": [].
   This creates a personal reminder as usual.
4. Team names can be anything (e.g., "Friends", "Family", "Office", "ABC", etc.). They do NOT need to contain "Team" or "Group".`
            : `The user currently has no teams. Always set "teamId": null, "teamName": null, "isTeamAmbiguous": false, "ambiguousTeamIds": [].`
          }

====================================
9. OUTPUT
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
  "teamId": null,
  "teamName": null,
  "isTeamAmbiguous": false,
  "ambiguousTeamIds": [],
  "items": [
    {
      "type": "note",
      "title": "Short title",
      "content": "Description",
      "dueDateLocal": null,
      "recurrenceMode": "once",
      "recurrenceDays": null,
      "checklist": [],
      "tags": ["#note", "#voice"],
      "teamId": null,
      "teamName": null,
      "isTeamAmbiguous": false,
      "ambiguousTeamIds": []
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
            // Team resolution for reminders
            let detectedTeamId: string | null = null;
            let detectedTeamName: string | null = null;
            let isTeamAmbiguous = false;
            let ambiguousTeams: TeamInfo[] = [];

            if (userTeams.length > 0) {
              if (parsed.isTeamAmbiguous) {
                isTeamAmbiguous = true;
                if (Array.isArray(parsed.ambiguousTeamIds)) {
                  ambiguousTeams = userTeams.filter((t) =>
                    parsed.ambiguousTeamIds.includes(t.id)
                  );
                }
              } else if (parsed.teamId && userTeams.some((t) => t.id === parsed.teamId)) {
                detectedTeamId = String(parsed.teamId);
                detectedTeamName =
                  userTeams.find((t) => t.id === parsed.teamId)?.name ||
                  String(parsed.teamName || "");
              } else if (parsed.teamName) {
                const matchedByName = userTeams.filter(
                  (t) => t.name.toLowerCase() === String(parsed.teamName).toLowerCase()
                );
                if (matchedByName.length === 1) {
                  detectedTeamId = matchedByName[0].id;
                  detectedTeamName = matchedByName[0].name;
                } else if (matchedByName.length > 1) {
                  isTeamAmbiguous = true;
                  ambiguousTeams = matchedByName;
                }
              }

              // Double-check with deterministic matcher as fallback/safety net
              if (!detectedTeamId && !isTeamAmbiguous) {
                const match = matchTeamDestination(rawText, userTeams);
                if (match.teamId) {
                  detectedTeamId = match.teamId;
                  detectedTeamName = match.teamName;
                } else if (match.isAmbiguous) {
                  isTeamAmbiguous = true;
                  ambiguousTeams = match.ambiguousTeams;
                }
              }
            }

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

                  let title =
                    typeof item.title === "string" &&
                      item.title.trim()
                      ? item.title.trim()
                      : cleanReminderTitle(
                        String(item.content || "")
                      );

                  let content =
                    typeof item.content === "string" &&
                      item.content.trim()
                      ? item.content.trim()
                      : cleanReminderContent(title);

                  if (detectedTeamName) {
                    title = cleanTeamDestinationText(title, detectedTeamName);
                    content = cleanTeamDestinationText(content, detectedTeamName);
                  }

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
                    teamId: detectedTeamId,
                    teamName: detectedTeamName,
                    isTeamAmbiguous,
                    ambiguousTeams,
                  };
                }
              );
            }

            // Rule-based multiple-reminder fallback.
            if (reminderIntent && formattedItems.length <= 1) {
              const ruleItems = formatRuleBasedReminders(
                rawText,
                refDate,
                clientTimezoneOffset
              );

              if (ruleItems.length > 1) {
                formattedItems = ruleItems.map((r) => {
                  let t = r.title;
                  let c = r.content || r.title;
                  if (detectedTeamName) {
                    t = cleanTeamDestinationText(t, detectedTeamName);
                    c = cleanTeamDestinationText(c, detectedTeamName);
                  }
                  return {
                    ...r,
                    title: t,
                    content: c,
                    teamId: detectedTeamId,
                    teamName: detectedTeamName,
                    isTeamAmbiguous,
                    ambiguousTeams,
                  };
                });
              }
            }
          }

          // STEP 5: Final single-item classification.

          if (formattedItems.length <= 1) {
            let finalType: ItemType;

            const hasReliableReminder =
              hasExplicitReminderIntent(rawText) ||
              (natural.isReminder && (Boolean(natural.detectedTime) || Boolean(natural.dueDate))) ||
              (teamMatch.teamId !== null && natural.isReminder);

            const isExplicitList =
              explicitListIntent ||
              (parsed.type === "list" && !hasReliableReminder);

            if (hasReliableReminder && !isExplicitList) {
              finalType = "reminder";
            } else if (isExplicitList) {
              finalType = "list";
            } else if (parsed.type === "reminder") {
              finalType = "reminder";
            } else if (parsed.type === "note") {
              finalType = "note";
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

            let detectedTeamId: string | null = null;
            let detectedTeamName: string | null = null;
            let isTeamAmbiguous = false;
            let ambiguousTeams: TeamInfo[] = [];

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

              // Team resolution for single reminder
              if (userTeams.length > 0) {
                if (parsed.isTeamAmbiguous) {
                  isTeamAmbiguous = true;
                  if (Array.isArray(parsed.ambiguousTeamIds)) {
                    ambiguousTeams = userTeams.filter((t) =>
                      parsed.ambiguousTeamIds.includes(t.id)
                    );
                  }
                } else if (parsed.teamId && userTeams.some((t) => t.id === parsed.teamId)) {
                  detectedTeamId = String(parsed.teamId);
                  detectedTeamName =
                    userTeams.find((t) => t.id === parsed.teamId)?.name ||
                    String(parsed.teamName || "");
                } else if (parsed.teamName) {
                  const matchedByName = userTeams.filter(
                    (t) => t.name.toLowerCase() === String(parsed.teamName).toLowerCase()
                  );
                  if (matchedByName.length === 1) {
                    detectedTeamId = matchedByName[0].id;
                    detectedTeamName = matchedByName[0].name;
                  } else if (matchedByName.length > 1) {
                    isTeamAmbiguous = true;
                    ambiguousTeams = matchedByName;
                  }
                }

                if (!detectedTeamId && !isTeamAmbiguous) {
                  const match = matchTeamDestination(rawText, userTeams);
                  if (match.teamId) {
                    detectedTeamId = match.teamId;
                    detectedTeamName = match.teamName;
                  } else if (match.isAmbiguous) {
                    isTeamAmbiguous = true;
                    ambiguousTeams = match.ambiguousTeams;
                  }
                }
              }
            } else {
              // Requirement 7: Notes and lists MUST ALWAYS remain personal!
              detectedTeamId = null;
              detectedTeamName = null;
              isTeamAmbiguous = false;
              ambiguousTeams = [];
            }

            // Generate the correct title and content.
            if (finalType === "reminder") {
              if (
                !finalTitle ||
                finalTitle.split(/\s+/).length > 7
              ) {
                finalTitle =
                  natural.title || cleanReminderTitle(rawText);
              } else {
                finalTitle = cleanReminderTitle(finalTitle);
              }

              if (!finalContent) {
                finalContent = cleanReminderContent(rawText);
              }

              if (detectedTeamName) {
                finalTitle = cleanTeamDestinationText(finalTitle, detectedTeamName);
                finalContent = cleanTeamDestinationText(finalContent, detectedTeamName);
              }
            }

            if (finalType === "list") {
              const listInfo = generateSmartListInfo(rawText);

              // Deterministic extraction for "add ... to my ... list".
              const extractedList =
                extractItemsFromAddToList(rawText);

              if (extractedList) {
                finalTitle = extractedList.title;
                finalContent = extractedList.title.toLowerCase().endsWith("list")
                  ? `Items to add to your ${extractedList.title}.`
                  : `Items to add to your ${extractedList.title} list.`;

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

                // Reconcile AI extraction with rule-based extraction
                finalChecklist = reconcileChecklists(
                  aiChecklist,
                  generatedChecklist,
                  rawText
                );
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
              teamId: finalType === "reminder" ? detectedTeamId : null,
              teamName: finalType === "reminder" ? detectedTeamName : null,
              isTeamAmbiguous: finalType === "reminder" ? isTeamAmbiguous : false,
              ambiguousTeams: finalType === "reminder" ? ambiguousTeams : [],
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

            teamId: primaryItem.type === "reminder" ? (primaryItem.teamId || null) : null,
            teamName: primaryItem.type === "reminder" ? (primaryItem.teamName || null) : null,
            isTeamAmbiguous: primaryItem.type === "reminder" ? Boolean(primaryItem.isTeamAmbiguous) : false,
            ambiguousTeams: primaryItem.type === "reminder" ? (primaryItem.ambiguousTeams || []) : [],

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
      clientTimezoneOffset,
      userTeams
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
