import { NextRequest, NextResponse } from "next/server";
import { convexServer } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, itemId, minutes } = body;

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    if (action === "done") {
      const result = await convexServer.mutation(
        api.items.toggleReminderStatus,
        {
          itemId: itemId as Id<"items">,
        }
      );
      return NextResponse.json({ success: true, result });
    }

    if (action === "snooze") {
      const snoozeMinutes = typeof minutes === "number" && minutes > 0 ? minutes : 15;
      await convexServer.mutation(api.items.snoozeReminder, {
        itemId: itemId as Id<"items">,
        minutes: snoozeMinutes,
      });
      return NextResponse.json({ success: true, snoozedMinutes: snoozeMinutes });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/notifications/action] Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
