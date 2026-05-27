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
      <div className="login-hero">
        <div className="login-copy">
          <div className="login-brand">
            <Image alt="" height={96} priority src="/newave-icon.png" width={74} />
            <div>
              <p className="eyebrow">Seattle Hyungjae Church</p>
              <strong>Newavely</strong>
            </div>
          </div>
          <h1>뉴웨이브 공동체를 더 선명하게 돌보는 공간</h1>
          <p>
            시애틀 형제교회 뉴웨이브 공동체의 멤버, 소그룹, 출석, 돌봄 팔로업을 한 흐름 안에서 관리합니다.
          </p>
        </div>

        <div className="login-card">
          <div>
            <p className="eyebrow">Newavely 로그인</p>
            <h2>Google 계정으로 시작하기</h2>
            <span>역할에 따라 접근 가능한 메뉴와 관리 권한이 자동으로 적용됩니다.</span>
          </div>
          <button className="google-button login-button" onClick={signInWithGoogle} type="button">
            <span className="google-dot" aria-hidden="true" />
            Google로 로그인
          </button>
          <p className="login-note">Newave 공동체 운영진과 리더를 위한 내부 관리 도구입니다.</p>
        </div>
      </div>
    </section>
  );
}
