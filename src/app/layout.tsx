import type { Metadata } from "next";
import { isRegisteredMember } from "@/lib/registration-access";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { MobileAwareNav } from "@/components/mobile-aware-nav";
import { PageTransition } from "@/components/page-transition";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getVisibleNavItems } from "@/lib/navigation";
import { roles, type Role } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";
import "./editorial.css";
import "./autumn-theme.css";

export const metadata: Metadata = {
  title: "Newavely 공동체 관리",
  description: "교회 공동체 멤버, 순, 출석, 권한 관리 앱",
};

async function getCurrentNavState(): Promise<{ role: Role | null; signedIn: boolean }> {
  const signedOut = { role: null, signedIn: false };
  if (!hasSupabaseEnv()) return signedOut;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return signedOut;

    const { data } = await supabase.from("members").select("role, status").eq("auth_user_id", user.id).maybeSingle();
    if (!isRegisteredMember(data)) return { role: null, signedIn: true };
    const role = data?.role;
    return { role: roles.includes(role as Role) ? (role as Role) : null, signedIn: true };
  } catch {
    return signedOut;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authEnabled = hasSupabaseEnv();
  const { role: navRole, signedIn } = await getCurrentNavState();
  const visibleNavItems = getVisibleNavItems(navRole);
  const themeScript = `
    (() => {
      try {
        const savedTheme = localStorage.getItem("newavely-theme");
        const theme = savedTheme === "light" || savedTheme === "dark"
          ? savedTheme
          : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  `;

  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div className="app-shell editorial-shell">
          <aside className="sidebar" aria-label="주요 메뉴">
            <Link className="brand" href="/" aria-label="대시보드로 이동">
              <Image alt="" className="brand-mark seasonal-logo" height={44} src="/newave-icon.png" width={34} />
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

              <MobileAwareNav items={visibleNavItems} />

              <div className="auth-card" aria-label="계정 메뉴">
                <ThemeToggle />
                {signedIn ? <SignOutButton enabled={authEnabled} /> : <Link className="sign-out-button" href="/">로그인</Link>}
              </div>
            </div>
          </aside>

          <Suspense fallback={null}>
            <PageTransition>{children}</PageTransition>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
