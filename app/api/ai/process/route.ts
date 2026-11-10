import { NextRequest, NextResponse } from "next/server";

// Fallback rule-based extractor when OpenAI quota is exhausted or offline
function parseTextRuleBased(rawText: string) {
  const lower = rawText.toLowerCase().trim();
  const words = rawText.trim().split(/\s+/);
  const title = words.slice(0, 6).join(" ") || "Voice Note";

  const isReminder =
    lower.includes("remind") ||
    lower.includes("tomorrow") ||
    lower.includes("at ") ||
    lower.includes("tonight") ||
    lower.includes("schedule") ||
    lower.includes("appointment") ||
    lower.includes("meeting");

  const isList =
    lower.includes("buy ") ||
    lower.includes("list") ||
    lower.includes("groceries") ||
    lower.includes("shopping") ||
    lower.includes("todo") ||
    rawText.includes(",") ||
    rawText.includes(" and ");

  if (isReminder) {
    // Default reminder due date: tomorrow at 9 AM, or +2 hours
    const dueDate = Date.now() + 2 * 60 * 60 * 1000;
    return {
      type: "reminder" as const,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      content: rawText,
      dueDate,
      checklist: undefined,
      tags: ["#reminder", "#voice"],
    };
  }

  if (isList) {
    // Split checklist items by commas, newlines, or 'and'
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

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as Blob | null;
      fallbackText = (formData.get("fallbackText") as string) || "";

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
            // If OpenAI quota exhausted or failed, use fallback browser transcript
            if (fallbackText) {
              rawText = fallbackText;
            }
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
    }

    // If Whisper didn't return text and we have fallbackText
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

    // Step 2: Structure with GPT-4o-mini if API key is present
    if (apiKey) {
      try {
        const systemPrompt = `You are an intelligent assistant that categorizes raw user thoughts/voice transcriptions into one of three formats:
1. "note": General thought, meeting note, idea, journal, or informational summary.
2. "reminder": A task with a specific deadline, due date, or future action.
3. "list": A checklist of multiple actionable items, groceries, or todo steps.

Current reference date/time: ${new Date().toISOString()} (${new Date().toLocaleString()}).

Respond ONLY with valid JSON with this exact structure:
{
  "type": "note" | "reminder" | "list",
  "title": "Short descriptive title (3-6 words)",
  "content": "Cleaned up, well-punctuated transcript or summary",
  "dueDate": timestamp_in_milliseconds_or_null_if_not_a_reminder,
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

          return NextResponse.json({
            success: true,
            usedOpenAI: true,
            rawTranscript: rawText,
            ...parsed,
          });
        }
      } catch (gptErr) {
        console.warn("GPT structuring error:", gptErr);
      }
    }

    // Fallback: Rule-based structuring (when OpenAI credit balance is exhausted or offline)
    const structured = parseTextRuleBased(rawText);
    return NextResponse.json({
      success: true,
      usedOpenAI: false,
      isQuotaExhausted: true,
      rawTranscript: rawText,
      ...structured,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process audio/text.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
