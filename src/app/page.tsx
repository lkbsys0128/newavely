import { Dashboard } from "@/components/dashboard";
import { AuthPanel } from "@/components/auth-panel";
import { sampleGroups, sampleMembers } from "@/lib/sample-data";
import { getRoleForEmail } from "@/lib/rbac";
import { SetupPanel } from "@/components/setup-panel";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    return <SetupPanel />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="main-content">
        <AuthPanel />
      </main>
    );
  }

  const email = user.email ?? "";
  const metadataRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined;
  const role = getRoleForEmail(email, metadataRole);

  return (
    <main className="main-content">
      <Dashboard
        user={{
          id: user.id,
          name: user.user_metadata?.full_name ?? user.email ?? "관리자",
          email,
          role,
        }}
        initialMembers={sampleMembers}
        groups={sampleGroups}
      />
    </main>
  );
}
