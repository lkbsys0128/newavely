import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newavely 공동체 관리",
  description: "교회 공동체 멤버, 순모임, 출석, 권한 관리 앱",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = hasSupabaseEnv();

  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <aside className="sidebar" aria-label="주요 메뉴">
            <div className="brand">
              <Image alt="" className="brand-mark" height={44} src="/newave-icon.png" width={34} />
              <div>
                <strong>Newavely</strong>
                <span>Newave 공동체</span>
              </div>
            </div>

            <nav className="nav-list" aria-label="앱 섹션">
              <Link href="/">대시보드</Link>
              <Link href="/profile">내 프로필</Link>
              <Link href="/members">멤버</Link>
              <Link href="/groups">순모임</Link>
              <Link href="/attendance">출석</Link>
              <Link href="/permissions">권한</Link>
              <Link href="/audit">감사 로그</Link>
            </nav>

            <div className="auth-card" aria-label="계정 메뉴">
              <SignOutButton enabled={authEnabled} />
            </div>
          </aside>

          {children}
        </div>
      </body>
    </html>
  );
}
