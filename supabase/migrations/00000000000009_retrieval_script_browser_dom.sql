-- =====================================================================
-- 00000000000009 — allow `script_browser_dom` in artefacts.retrieval
--
-- Closes open decision 7 (docs/CURRENT_MILESTONE.md), settled 10 August 2026.
--
-- WHY
--   Tier 2 heat-detail popups are collected by scripts/collect_heat_popups.ts:
--   Playwright drives headless chromium under wsl-analytics-research/0.1,
--   clicks each heat's Details link and serialises the popup container's
--   outerHTML. The popup is client-rendered and has no server endpoint —
--   docs/findings/2026-08-09_acquisition_routes.md records the four eliminated
--   routes. There is no HTTP response anywhere in that path, which is why those
--   sidecars carry http_status: null and content_type: null permanently, not
--   provisionally.
--
--   The existing four values encode two orthogonal facts and only half-fill the
--   grid they imply:
--
--                     | wire bytes      | serialised DOM
--     ----------------+-----------------+---------------------
--      Taryn's browser|  —              | manual_browser_save
--      project script | script_own_ua   | (this migration)
--
--   `script_browser_dom` is the empty cell. Adding it completes the 2x2 rather
--   than opening the enum indefinitely.
--
-- WHY NOT AN EXISTING VALUE
--   script_own_ua implies a response with a status and a content type. Filing a
--   serialised DOM under it would be quietly false, and quietly false is the v1
--   failure shape.
--
--   manual_browser_save is Taryn's own browser session, her user-agent, her
--   cookies — the retrieval class the Terms of Use finding (2026-07-26) reasons
--   about under personal use, 7(F). Headless chromium under a research UA is a
--   different agent making a different request. The column comment below says
--   the project must be able to answer that per row, permanently; collapsing the
--   two would make it unable to.
--
--   A properly normalised split into (retrieval_agent, bytes_kind) is the right
--   long-run shape and is deliberately NOT done here. It rewrites a NOT NULL
--   column with live rows plus every sidecar on disk, mid-milestone. On the
--   Later list.
--
-- SCOPE
--   Widens a CHECK constraint and corrects two comments. No data is written, no
--   row is modified, nothing is dropped but the constraint being replaced.
--   Strictly additive: every value legal before this migration is legal after
--   it, so no existing row can be invalidated.
--
-- ORDERING NOTE
--   00000000000005 and 00000000000007 are deliberately unapplied and must stay
--   that way — see CLAUDE.md trap 17. The applied ledger is 1,2,3,4,6,8, so
--   out-of-order application is already the established pattern here. Apply this
--   through the Supabase MCP apply_migration or the SQL Editor. Do NOT reach for
--   `npm run migrate` without checking what it would pick up first.
-- =====================================================================

ALTER TABLE artefacts DROP CONSTRAINT artefacts_retrieval_check;

ALTER TABLE artefacts ADD CONSTRAINT artefacts_retrieval_check CHECK (retrieval IN (
  'manual_browser_save',    -- Taryn's own browser, Save As. Personal use, ToU 7(F)
  'script_own_ua',          -- project scripts under wsl-analytics-research/0.1. Wire bytes
  'script_browser_dom',     -- project scripts driving headless chromium. Serialised DOM, no HTTP response exists
  'published_pdf',          -- rulebooks
  'third_party'
));

COMMENT ON COLUMN artefacts.retrieval IS
  'How the bytes were obtained. The Terms of Use finding (2026-07-26) means the project must be able to answer that per row, permanently. Two facts are encoded together: which agent made the request, and whether the bytes are a wire response or a serialised DOM. manual_browser_save = Taryn''s browser, DOM. script_own_ua = project script, wire. script_browser_dom = project script driving headless chromium, DOM — no HTTP response exists for these and http_status/content_type are permanently null, not pending. Splitting this into two columns is on the Later list.';

COMMENT ON CONSTRAINT artefacts_retrieval_check ON artefacts IS
  'Widened by 00000000000009 to admit script_browser_dom. Keep scripts/register_artefacts.ts LEGAL_RETRIEVAL in step with this list — it refuses to emit SQL the database would reject, so the two drifting apart shows up as artefacts silently going unregistered.';

-- Record in scripts/migrate.ts's ledger. 00000000000008 explains why this is
-- necessary: public.schema_migrations and supabase_migrations.schema_migrations
-- are unrelated, migrate.ts reads only the former, and the SQL Editor writes to
-- neither. Without this line `npm run migrate` would later try to re-run this
-- file and fail on the DROP of a constraint that no longer exists under that
-- name. Idempotent, so applying through the MCP connector is also safe.
INSERT INTO public.schema_migrations (version)
VALUES ('00000000000009_retrieval_script_browser_dom.sql')
ON CONFLICT (version) DO NOTHING;


-- The 00000000000001 comment on this value said "pre-26-July only", and the
-- column comment said script_own_ua "should appear on exactly one artefact —
-- the 2024 rankings page — and never again unless WSL grants permission".
-- Both predate the 8 August green light and are now false: five retained
-- artefacts carry script_own_ua legitimately. The CHECK value was always fine;
-- only the prose misled. Flagged in CLAUDE.md and corrected by the column
-- comment above.
