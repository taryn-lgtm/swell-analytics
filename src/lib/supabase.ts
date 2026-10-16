// ─────────────────────────────────────────────────────────────────────────────
// QUARANTINED — v1. Deliberately left reading the v1 variable names.
//
// 1 September 2026. The unsuffixed NEXT_PUBLIC_SUPABASE_URL, _ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY were REMOVED from .env.local that day, so every
// export in this file now throws "Missing env var" rather than connecting.
// That is the intent, not an oversight.
//
// Nothing imports the `supabase` export. The only live consumer of anything
// here is scripts/ingest.ts:888, which imports createServiceClient() and is
// itself quarantined v1 code (CLAUDE.md, "What is quarantined").
//
// Do NOT point this file at the _V2 variables to make it work again: that
// hands a quarantined v1 loader an RLS-bypassing client against the v2 build.
// The app reads v2 through src/lib/db/server.ts and performs zero writes.
//
// Decided with Taryn, 1 September 2026, closing M3 definition item 1.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

// Generated via `supabase gen types typescript` — regenerate after any migration.
import type { Database } from "./database.types";

// ── Public client (anon key) ──────────────────────────────────────────────────
// Safe to use in Server Components and client components.
// Only has access to rows permitted by Row Level Security policies.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseAnonKey) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

// ── Service-role client factory (server/scripts only) ─────────────────────────
// Never call this from a browser context — it bypasses Row Level Security.
// Intended solely for scripts/ingest.ts and other server-side data pipelines.

export function createServiceClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error(
      "createServiceClient() must not be called from a browser context. " +
        "Use the anon `supabase` client instead."
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
