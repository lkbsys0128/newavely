import type { Role } from "@/lib/rbac";
import type { Group, Member } from "@/lib/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  ensureAttendanceEvent,
  formatSupabaseError,
  getDashboardData,
  getOrCreateCurrentMember,
} from "@/lib/supabase/data";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type ReadyAppPageData = {
  status: "ready";
  user: AppUser;
  attendanceDate: string;
  attendanceEventId?: string;
  members: Member[];
  groups: Group[];
};

export type AppPageData =
  | { status: "setup" }
  | { status: "auth" }
  | { status: "error"; message: string }
  | ReadyAppPageData;

export async function getAppPageData(): Promise<AppPageData> {
  if (!hasSupabaseEnv()) {
    return { status: "setup" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "auth" };
  }

  try {
    const currentMember = await getOrCreateCurrentMember(supabase, {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name,
    });
    await ensureAttendanceEvent(supabase);
    const dashboardData = await getDashboardData(supabase);

    return {
      status: "ready",
      user: {
        id: user.id,
        name: user.user_metadata?.full_name ?? user.email ?? "관리자",
        email: user.email ?? "",
        role: currentMember.role,
      },
      attendanceDate: dashboardData.attendanceDate,
      attendanceEventId: dashboardData.attendanceEventId,
      members: dashboardData.members,
      groups: dashboardData.groups,
    };
  } catch (error) {
    return { status: "error", message: formatSupabaseError(error) };
  }
}
