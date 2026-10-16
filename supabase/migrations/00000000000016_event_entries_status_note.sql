-- =====================================================================
-- 00000000000016_event_entries_status_note.sql
--
-- M2 item 4 groundwork. event_entries has never held a row; loading the
-- 2024 and 2025 final rankings is the first attempt, and the published
-- data does not fit the column as designed.
--
-- THE CASE THAT FORCED THIS. 2025 Bonsoy Gold Coast Pro, Ryan Callinan:
--
--     "Parental leave: Replaced by Morgan Cibilic"
--
-- published alongside a 33rd place and 265 points. ee_status_check allows
-- competed / injured_withdrawal / did_not_contest, and none of the three
-- is true. It is not an injury, so injured_withdrawal would be a false
-- statement about a real person. It is not did_not_contest either, and
-- that option is closed by the schema itself rather than by judgement:
-- ee_did_not_contest_agrees demands points_status = 'not_contested', and
-- this row has published points. 'competed' would discard the published
-- fact into a comment.
--
-- So the enum is widened by one value, and the published words are stored
-- beside it.
--
-- WHY status_note EXISTS, and why it is not redundant. The status note is
-- free text and WSL writes it inconsistently — measured across the two
-- in-scope seasons, 37 of 700 cells carry one, under five leading
-- keywords, with variants like 'Injured: Ongoing injury - Replaced by
-- Ian Gentil' and a bare 'Replacement'. Mapping that onto a four-value
-- enum is a derivation, and this project's rule is that a derived value
-- and its published source are both stored so the two can be asserted
-- against each other later. The 2022 page — out of V1 scope, read as a
-- structural control — carries 'Replacement: WSL Wildcard.', which leads
-- with one category and names another. If a mapping like that ever has to
-- be revisited, the verbatim string is what makes the revision possible
-- without re-reading 666 KB of retained HTML.
--
-- ee_status_note_required is deliberately narrow. It binds only the new
-- value, because that is the one whose meaning lives entirely in the
-- published words. 'competed' and 'did_not_contest' are carried by 663
-- unannotated cells that have no note to store.
--
-- Nothing here interprets the note. No trigger, no generated column, no
-- CHECK on its contents. It is published text, stored as published text.
-- =====================================================================

BEGIN;

ALTER TABLE event_entries
  ADD COLUMN status_note text;

ALTER TABLE event_entries
  DROP CONSTRAINT ee_status_check;

ALTER TABLE event_entries
  ADD CONSTRAINT ee_status_check
  CHECK (status = ANY (ARRAY[
    'competed'::text,
    'injured_withdrawal'::text,
    'did_not_contest'::text,
    'non_injury_withdrawal'::text
  ]));

ALTER TABLE event_entries
  ADD CONSTRAINT ee_status_note_required
  CHECK (status <> 'non_injury_withdrawal' OR status_note IS NOT NULL);

COMMENT ON COLUMN event_entries.status_note IS
  'The rankings page''s <span class="status-note"> for this cell, VERBATIM. Free text, written inconsistently by WSL; five leading keywords across 2024-2025 (Injured, Withdrawn, Wildcard, Replacement, Parental leave) and 37 of 700 cells carry one. status and participation are DERIVED from it; this column is the published source they were derived from. Never parse it in a view without saying so.';

COMMENT ON COLUMN event_entries.status IS
  'Derived from status_note. non_injury_withdrawal covers a published withdrawal that is not an injury — one row in V1 scope, Ryan Callinan''s parental leave at the 2025 Gold Coast Pro, which kept its placing and points. Built on ONE observed instance: do not treat the four values as a complete vocabulary.';

COMMIT;
