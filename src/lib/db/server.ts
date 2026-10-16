import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Read-only Supabase client for React Server Components. Publishable key —
 * everything it can see is governed by RLS. This app performs ZERO writes.
 * (Scripts use the service-role client in lib/supabase.ts; never here.)
 *
 * TARGET — read this before changing it.
 *
 * These are the _V2 variables, and the suffix is load-bearing. The unsuffixed
 * NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY pair named the QUARANTINED v1 project,
 * which this file read until 1 September 2026. The ref is deliberately not
 * written here: item 1's check is a grep for it across src/ and the env.
 *
 * Do NOT "simplify" this by re-pointing the unsuffixed names at v2 instead:
 * scripts/migrate.ts defines v1 as NEXT_PUBLIC_SUPABASE_URL, so doing that
 * makes `--v1 --i-mean-it` print "v1 — QUARANTINED" while migrating v2.
 *
 * v2 issues sb_publishable_ / sb_secret_ keys, not anon / service_role.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_V2;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_V2;

if (!supabaseUrl) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL_V2");
if (!supabaseAnonKey)
  throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_V2");

export const db: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
