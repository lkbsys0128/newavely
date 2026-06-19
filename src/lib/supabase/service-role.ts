import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export function createServiceRoleClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseServiceRoleEnv();

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
