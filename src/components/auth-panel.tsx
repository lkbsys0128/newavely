"use client";

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
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Newavely</p>
          <h1>공동체 관리 시작하기</h1>
        </div>
        <span>Supabase Google Auth</span>
      </div>
      <div className="care-list">
        <article className="care-item">
          <div className="person-block">
            <strong>Google 계정으로 로그인</strong>
            <span>로그인 후 역할에 따라 멤버, 소그룹, 출석 권한이 적용됩니다.</span>
          </div>
          <button className="google-button" onClick={signInWithGoogle} type="button">
            <span className="google-dot" aria-hidden="true" />
            Google로 로그인
          </button>
        </article>
      </div>
    </section>
  );
}
