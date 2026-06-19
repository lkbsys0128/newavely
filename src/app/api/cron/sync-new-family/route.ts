import { NextResponse } from "next/server";
import { syncNewFamilyApplicantsFromSheet } from "@/lib/new-family-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await syncNewFamilyApplicantsFromSheet(supabase);

  await supabase.from("audit_logs").insert({
    action: "new_family.sync_google_sheet.cron",
    target_table: "new_family_applicants",
    metadata: {
      spreadsheetId: result.spreadsheetId,
      sheetName: result.sheetName,
      rowCount: result.syncedRows,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
