"use client";

import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";

export function AuthPanel() {
  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-mark">
          <Image alt="" height={118} priority src="/newave-icon.png" width={92} />
        </div>
        <div className="login-title">
          <p className="eyebrow">Seattle Hyungjae Church · Newave</p>
          <h1>Newavely</h1>
          <span>시애틀 형제교회 뉴웨이브 공동체 관리</span>
        </div>
        <p className="login-copy">
          멤버, 소그룹, 출석, 돌봄 팔로업을 한 곳에서 기록하고 공동체의 흐름을 선명하게 봅니다.
        </p>
        <div className="login-chips" aria-label="관리 기능">
          <span>멤버</span>
          <span>소그룹</span>
          <span>출석</span>
          <span>돌봄</span>
        </div>
        <div className="login-action">
          <button className="google-button login-button" onClick={signInWithGoogle} type="button">
            <span className="google-dot" aria-hidden="true" />
            Google로 로그인
          </button>
        </div>
        <p className="login-note">역할에 따라 접근 가능한 메뉴와 관리 권한이 자동으로 적용됩니다.</p>
      </div>
    </section>
  );
}
