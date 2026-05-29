"use client";

import { createClient } from "@/lib/supabase/browser";

export function SignOutButton({ enabled }: { enabled: boolean }) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button className="sign-out-button" disabled={!enabled} onClick={signOut} type="button">
      <span className="sign-out-icon" aria-hidden="true">
        →
      </span>
      <span>로그아웃</span>
    </button>
  );
}
