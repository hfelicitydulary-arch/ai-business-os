import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only contexts with no logged-in user
// (e.g. cron jobs). Bypasses RLS entirely — never expose this client
// or the key it uses to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
