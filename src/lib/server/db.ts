import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServerEnvironment } from "@/lib/config/environment";

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;
  const env = requireServerEnvironment();
  adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function getSupabaseAuthClient() {
  if (authClient) return authClient;
  const env = requireServerEnvironment();
  authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}
