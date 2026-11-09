import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured in .env.local. Please add OPENAI_API_KEY=your_key to .env.local to enable AI transcription and structuring.",
      },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let rawText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as Blob | null;

      if (!audioFile) {
        return NextResponse.json(
          { error: "No audio file provided in request." },
          { status: 400 }
        );
      }

      // Step 1: Send audio to OpenAI Whisper API using native fetch
      const whisperFormData = new FormData();
      whisperFormData.append("file", audioFile, "recording.webm");
      whisperFormData.append("model", "whisper-1");
      whisperFormData.append("response_format", "json");

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

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        return NextResponse.json(
          { error: `Whisper API failed: ${errText}` },
          { status: whisperRes.status }
        );
      }

      const whisperData = await whisperRes.json();
      rawText = whisperData.text || "";
    } else {
      // Direct text input
      const json = await req.json();
      rawText = json.text || "";
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted or provided." },
        { status: 400 }
      );
    }

    // Step 2: Use GPT-4o-mini to categorize and structure the content into JSON
    const systemPrompt = `You are an intelligent assistant that categorizes raw user thoughts/voice transcriptions into one of three formats:
1. "note": General thought, meeting note, idea, journal, or informational summary.
2. "reminder": A task with a specific deadline, due date, or future action (e.g., "call mom at 5pm", "doctor appointment tomorrow", "pay electricity bill by Friday").
3. "list": A checklist of multiple actionable items, groceries, shopping items, or todo steps (e.g., "buy milk, eggs, bread", "pack suitcase with clothes, charger, toothbrush").

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
}

Guidelines:
- If type is "list", extract each item into the "checklist" array with a unique string id.
- If type is "reminder", compute the exact epoch timestamp in milliseconds for "dueDate" relative to the current reference date/time. If a specific time wasn't specified (e.g. "tomorrow"), default to 9:00 AM of that day.
- Suggest 1 to 3 relevant lowercase hashtags for "tags" (e.g., "#work", "#shopping", "#personal", "#idea", "#health").
- Never output markdown or extra commentary, ONLY the raw JSON object.`;

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

    if (!gptRes.ok) {
      const errText = await gptRes.text();
      return NextResponse.json(
        { error: `GPT structuring failed: ${errText}` },
        { status: gptRes.status }
      );
    }

    const gptData = await gptRes.json();
    const parsed = JSON.parse(gptData.choices[0].message.content);

    return NextResponse.json({
      success: true,
      rawTranscript: rawText,
      ...parsed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process audio/text." },
      { status: 500 }
    );
  }
}

