import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newavely 공동체 관리",
  description: "교회 공동체 멤버, 소그룹, 출석, 권한 관리 앱",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = hasSupabaseEnv();

  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <aside className="sidebar" aria-label="주요 메뉴">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                NW
              </div>
              <div>
                <strong>Newavely</strong>
                <span>멤버십 운영</span>
              </div>
            </div>

            <nav className="nav-list" aria-label="앱 섹션">
              <a href="#dashboard">대시보드</a>
              <a href="#members">멤버</a>
              <a href="#groups">소그룹</a>
              <a href="#attendance">출석</a>
              <a href="#permissions">권한</a>
            </nav>

            <div className="auth-card">
              <span>Supabase Google Auth</span>
              <SignOutButton enabled={authEnabled} />
            </div>
          </aside>

          {children}
        </div>
      </body>
    </html>
  );
}
