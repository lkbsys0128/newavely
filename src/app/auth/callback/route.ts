import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const redirectUrl = new URL("/", request.url);
      redirectUrl.searchParams.set("auth_error", error.message);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(new URL("/", request.url));
}
