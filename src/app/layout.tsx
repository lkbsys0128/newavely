import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MobileAwareNav } from "@/components/mobile-aware-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newavely 공동체 관리",
  description: "교회 공동체 멤버, 순, 출석, 권한 관리 앱",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = hasSupabaseEnv();

  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <aside className="sidebar" aria-label="주요 메뉴">
            <Link className="brand" href="/" aria-label="대시보드로 이동">
              <Image alt="" className="brand-mark" height={44} src="/newave-icon.png" width={34} />
              <div>
                <strong>Newavely</strong>
                <span>Newave 공동체</span>
              </div>
            </Link>

            <div className="sidebar-menu">
              <input className="mobile-menu-control" id="mobile-menu-control" type="checkbox" />
              <label className="mobile-menu-toggle" htmlFor="mobile-menu-control">
                메뉴
              </label>

              <MobileAwareNav />

              <div className="auth-card" aria-label="계정 메뉴">
                <SignOutButton enabled={authEnabled} />
              </div>
            </div>
          </aside>

          {children}
        </div>
      </body>
    </html>
  );
}
