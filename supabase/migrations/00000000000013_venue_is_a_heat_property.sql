-- =====================================================================
-- 00000000000013_venue_is_a_heat_property.sql
--
-- Break is a Datum input. events.venue_id cannot carry it, because three
-- events were surfed at two breaks:
--
--     2024 e198 MEO Rip Curl Pro Portugal   Supertubos 43, Molhe Leste  4
--     2024 e199 Rip Curl Pro Bells Beach    Bells Beach 23, Winki Pop  24
--     2025 e326 WA Margaret River Pro       Main Break  41, The Box     6
--
-- MEASURED from 712 retained heat popups, whose header publishes
-- "<date> at <venue>". 2024 e199 is the sharp case: 24 of 47 heats — more
-- than half — were not surfed at the event's nominal venue. Writing a
-- single venue per event would tell Datum those 24 heats happened at a
-- break they did not happen at.
--
-- So venue moves to the heat, and events.venue_id stays as the NOMINAL
-- venue the event is known by. Both carry their own artefact, because the
-- heat's venue comes from the popup while heats.artefact_id points at the
-- round page — a different artefact.
--
-- The paired CHECK constraints are deliberately stronger than a provenance
-- view: a venue cannot be recorded at all without the artefact that
-- publishes it. M2 item 7 ("zero fabricated rows") is enforced here rather
-- than audited after the fact.
--
-- docs/findings/2026-08-26_venue_is_a_heat_property.md
-- =====================================================================

BEGIN;

ALTER TABLE heats
  ADD COLUMN venue_id          bigint REFERENCES venues(id),
  ADD COLUMN venue_artefact_id bigint REFERENCES artefacts(id);

ALTER TABLE heats
  ADD CONSTRAINT heats_venue_needs_source
  CHECK ((venue_id IS NULL) = (venue_artefact_id IS NULL));

COMMENT ON COLUMN heats.venue_id IS
  'The break this heat was actually surfed at, from the Tier 2 popup header ("April 20, 2024 at Main Break"). This is the Datum break input, NOT events.venue_id — three events ran at two breaks and 2024 e199 split 23/24.';

COMMENT ON COLUMN heats.venue_artefact_id IS
  'The popup that publishes this heat''s venue. Separate from heats.artefact_id, which points at the round page. Paired with venue_id by heats_venue_needs_source.';

ALTER TABLE events
  ADD COLUMN venue_artefact_id bigint REFERENCES artefacts(id);

ALTER TABLE events
  ADD CONSTRAINT events_venue_needs_source
  CHECK ((venue_id IS NULL) = (venue_artefact_id IS NULL));

COMMENT ON COLUMN events.venue_id IS
  'NOMINAL venue — the break the event is known by, not where every heat ran. Do not use as a Datum input; use heats.venue_id. Sourced from the event page''s published location string where it names a break (13 of 22), otherwise from the unambiguous break on that event''s popups (9 of 22, all >=87% single-break).';

-- Heats with no venue recorded. Expected to be exactly the heats holding
-- no popup, which are the same heats holding no waves and no conditions.
CREATE OR REPLACE VIEW v_heat_venue_gaps AS
SELECT h.id AS heat_id, h.wsl_heat_id, e.season_year, e.event_number
FROM heats h
JOIN rounds r ON r.id = h.round_id
JOIN events e ON e.id = r.event_id
WHERE h.venue_id IS NULL;

INSERT INTO public.schema_migrations (version) VALUES
  ('00000000000013_venue_is_a_heat_property.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
