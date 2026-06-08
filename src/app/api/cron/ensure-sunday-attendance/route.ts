import { ensureAttendanceEvent, getLosAngelesMostRecentSunday } from "@/lib/supabase/data";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date")?.trim();

  if (requestedDate && !isValidIsoDate(requestedDate)) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }

  const eventDate = requestedDate || getLosAngelesMostRecentSunday();
  const supabase = createServiceRoleClient();

  await ensureAttendanceEvent(supabase, {
    autoCreateSundayWorship: true,
    targetDate: eventDate,
  });

  return Response.json({
    ensuredDate: eventDate,
    ensuredTitles: ["주일 예배", "순모임"],
    ok: true,
  });
}
