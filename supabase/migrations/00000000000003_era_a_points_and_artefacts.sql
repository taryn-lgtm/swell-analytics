-- =====================================================================
-- 00000000000003_era_a_points_and_artefacts.sql
-- Rulebook artefacts, Era A points table, Era A band occupancy
-- =====================================================================
--
-- Depends on: 00000000000001_m1_schema.sql, 00000000000002_era_a_round_templates.sql
-- Target:     v2, ref tjwqskjsyluxepdbwjet
-- Applied by: Taryn.
--
-- WHAT THIS UNLOCKS. points_bands.artefact_id is NOT NULL, so the points
-- table could not be loaded until the rulebooks were registered. With
-- both loaded, four audit views stop being decorative and start being
-- runnable: v_band_occupancy_check, v_round_template_band_disagreements,
-- v_round_template_flow_disagreements and v_points_reconciliation.
--
-- VERIFICATION DONE BEFORE WRITING THIS FILE, 8 August 2026.
-- Every value below was read out of the PDFs rather than copied from
-- era_a.yaml, and then checked against era_a.yaml. Both agree.
--
--   * CT ranking points, Appendix B, extracted as text from all four
--     held Era A books. The CT column is character-identical in all
--     four: 10000, 7800, 6085, 4745, 3320, 1330, 265, with an explicit
--     0 at every position in between.
--   * Band occupancy, Appendix A. Text-extractable in the 2022-season
--     books. In the 2025-season books Appendix A is a flat image, so it
--     was extracted with pdfimages and read: pre-cut 1,1,2,4,8,16,4 and
--     post-cut 1,1,2,4,8,8. Identical to the 2022-season tables.
--
-- The 2025 book's Appendix A also states "7 Men Events" pre-cut and
-- "4 Men Events" after cut, which independently corroborates
-- era_a.yaml's 2025 throwaway of best 6 of 7.
--
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- The rulebooks, as retained artefacts.
--
-- sha256 and content_length computed from the files on disk, 8 Aug 2026.
--
-- TWO HONEST GAPS, both recorded in data_gaps below rather than guessed:
--   * url is NULL on every row. The download URLs were not recorded at
--     retrieval and are not reconstructable from the filenames.
--   * fetched_at is the file's mtime on disk, which is when the bytes
--     landed in the working tree, NOT an observed download timestamp.
--     It is the closest true statement available and is labelled as such.
--
-- FILENAMES ARE NOT THE SEASONS THEY GOVERN. Three of six title years
-- are wrong. docs/findings/2026-07-29_rulebook_provenance.md §1.
-- ---------------------------------------------------------------------

INSERT INTO artefacts
  (file_path, sha256, fetched_at, content_type, content_length, retrieval, notes) VALUES

  ('docs/format-spec/rulebooks/2022_WSL_Rule_Book_-_August_31__2022_-_Final.pdf',
   '8e9e5b476fb225a888d7dfe99c6acc4e6d6703e699dcd4c04a707c909e24960d',
   '2026-07-25 18:17:44+01', 'application/pdf', 1863482, 'published_pdf',
   'GOVERNS THE 2022 SEASON. Preface says 2022; Appendix B labelled "Men CT 2022". Last updated 2022-08-31. fetched_at is the file mtime, not an observed download time. url not recorded at retrieval.'),

  ('docs/format-spec/rulebooks/2023_WSL_Rule_Book.pdf',
   '5608feee61bb303ea054f3fc22f4be3992a94ec38bd9117d575d2401bbafce73',
   '2026-07-25 18:16:50+01', 'application/pdf', 1240643, 'published_pdf',
   'TITLED 2023, GOVERNS 2022. Preface says 2022 and Appendix A is labelled "Men CT 2022". Two internal markers against one filename. There is no reading on which this is a clean source for the 2023 season: either it governs 2022, or its own preface and appendix are both wrong. fetched_at is the file mtime.'),

  ('docs/format-spec/rulebooks/2024_WSL_Rule_Book_clean_01252025.pdf',
   '62f5af577d99a25b803a71e66c17f6187d9221171841f60d7d7c7ff27c0199c3',
   '2026-07-25 18:19:14+01', 'application/pdf', 1515370, 'published_pdf',
   'TITLED 2024, GOVERNS 2025. Preface says 2025, Appendix A labelled "Men CT 2025", last updated 2025-01-25. fetched_at is the file mtime.'),

  ('docs/format-spec/rulebooks/2025_WSL_Rule_Book_clean_06012025.pdf',
   'c8d7113765d0414ab3f0b2af18944e2e1d0e2cc15bb71a7dfc34b3fb97819d2b',
   '2026-07-25 18:25:49+01', 'application/pdf', 1595096, 'published_pdf',
   'GOVERNS THE 2025 SEASON. Last updated 2025-06-01. Appendix A is a flat image in this book, not extractable text; the band occupancy below was read from the extracted image. fetched_at is the file mtime.'),

  ('docs/format-spec/rulebooks/2020_WSL_Rule_Book_June_15_2021_Update_Final.pdf',
   '52a459803ea15cc4ba04e1c171f1811d553ad0e82d3b3e102d9fa2fec40868a5',
   '2026-07-25 18:19:50+01', 'application/pdf', 1044557, 'published_pdf',
   'TITLED 2020, GOVERNS 2021 — Era B, out of current scope. Registered so the artefact index is complete. No Appendix B ranking-points table found. fetched_at is the file mtime.'),

  ('docs/format-spec/rulebooks/2026_WSL_Rule_Book_clean_04014026.pdf',
   '838b3aac798280636b6369816d926db8e1eebfe4a73435955a348792ca214654',
   '2026-04-19 12:40:30+01', 'application/pdf', 1323938, 'published_pdf',
   'Governs 2026, presumed — no preface year found. Out of Era A. Registered because it is the book that DIFFERS: 17th becomes 1,000, 33rd becomes 500, and an elevated Pipe column appears. Held so that difference stays checkable. fetched_at is the file mtime.');


-- =====================================================================
-- Era A ranking points — rulebook Appendix B, CT column.
--
-- Banded. A position not listed means nobody finishes there; the books
-- print an explicit 0 at those positions rather than leaving them blank.
--
-- NO PIPE MULTIPLIER IN ERA A. The elevated Pipe column first appears in
-- the 2026 book, which is why that book is registered above.
--
-- PROVENANCE, STATED PRECISELY. The CT column is identical in all four
-- held Era A books. Those four books govern two seasons — 2022 and 2025 —
-- so 2022 and 2025 are verified and 2023 and 2024 are bracketed by
-- identical endpoints. era_a.yaml's `verified_identical_in: [2022, 2023,
-- 2024, 2025]` overstates that: four documents is not four seasons.
-- The value is almost certainly right for all four; the provenance claim
-- is what needs correcting.
--
-- artefact_id is the 2022-season book. One artefact_id cannot express
-- "verified at both ends of the era", so source_note carries it.
-- =====================================================================

INSERT INTO points_bands (era_code, position, points, artefact_id, source_note)
SELECT 'A', v.position, v.points, a.id,
       'Appendix B, CT column. Read from all four held Era A books and identical in every one. Those books govern 2022 and 2025, so 2023 and 2024 are bracketed rather than directly sourced. Cross-checked against era_a.yaml points.placements — agrees.'
FROM (VALUES
  ( 1, 10000),
  ( 2,  7800),
  ( 3,  6085),
  ( 5,  4745),
  ( 9,  3320),
  (17,  1330),
  (33,   265)
) AS v(position, points)
CROSS JOIN artefacts a
WHERE a.file_path = 'docs/format-spec/rulebooks/2022_WSL_Rule_Book_-_August_31__2022_-_Final.pdf';


-- =====================================================================
-- Band occupancy — how many surfers share each band.
--
-- SOURCED, NOT DERIVED. The prize-money breakdowns in Appendix A print
-- the count against each placement directly. This was previously an
-- argument ("the finishing positions are forced by Appendix B's band
-- widths against the cohort sizes") and is now a citation.
--
-- Pre-cut, 36 surfers:  1 + 1 + 2 + 4 + 8 + 16 + 4 = 36
-- Post-cut, 24 surfers: 1 + 1 + 2 + 4 + 8 +  8     = 24, no 33rd band
--
-- Read in the 2022-season book as text and in the 2025-season book from
-- the extracted Appendix A image. Both identical.
--
-- The post-cut field is 24, not 22. Rule 1.09(a)(i) qualifies the top 22
-- men from the CT rankings; wildcards complete the field. Do not
-- conflate "requalified" with "competing".
-- =====================================================================

INSERT INTO points_band_occupancy
  (era_code, field_size, position, band_width, artefact_id, source_note)
SELECT 'A', v.field_size, v.position, v.band_width, a.id, v.note
FROM (VALUES
  -- Pre-cut, 36
  (36,  1,  1, 'Appendix A, Men CT (PRE CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (36,  2,  1, 'Appendix A, Men CT (PRE CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (36,  3,  2, 'Appendix A, Men CT (PRE CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (36,  5,  4, 'Appendix A, Men CT (PRE CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (36,  9,  8, 'Appendix A, Men CT (PRE CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (36, 17, 16, 'Appendix A, Men CT (PRE CUT). Sixteen, not eight — this is the band that differs between the pre-cut and post-cut fields.'),
  (36, 33,  4, 'Appendix A, Men CT (PRE CUT). Exists only pre-cut: 36 - 32 = 4, the Elimination Round third-places.'),
  -- Post-cut, 24
  (24,  1,  1, 'Appendix A, Men CT (AFTER CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (24,  2,  1, 'Appendix A, Men CT (AFTER CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (24,  3,  2, 'Appendix A, Men CT (AFTER CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (24,  5,  4, 'Appendix A, Men CT (AFTER CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (24,  9,  8, 'Appendix A, Men CT (AFTER CUT). Verified in the 2022-season book as text and in the 2025-season book from the extracted image.'),
  (24, 17,  8, 'Appendix A, Men CT (AFTER CUT). Eight, not sixteen. The post-cut table has no 33rd row at all — the band does not exist in a 24-surfer field.')
) AS v(field_size, position, band_width, note)
CROSS JOIN artefacts a
WHERE a.file_path = 'docs/format-spec/rulebooks/2022_WSL_Rule_Book_-_August_31__2022_-_Final.pdf';


-- =====================================================================
-- Gaps opened by this file. Recorded, not papered over.
--
-- ONLY THE TOUR-SCOPED GAPS ARE HERE. The two season-scoped ones — the
-- 2023 and 2024 points_bands provenance gaps — moved to
-- 00000000000004_deferred_season_gaps.sql on 8 August, because
-- data_gaps.season_year is a foreign key to seasons(year) and no seasons
-- rows exist until ingest creates them. Attempting them here fails with
-- 23503 and rolls back the whole migration. Found by executing the file,
-- not by parsing it. See docs/findings/2026-08-08_schema_review.md.
-- =====================================================================

INSERT INTO data_gaps (scope, season_year, field, reason, source_note) VALUES
  ('tour', NULL, 'artefacts.url for the six rulebook PDFs',
   'The download URLs were not recorded at retrieval and are not reconstructable from the filenames. Left NULL rather than guessed.',
   'Back-fill from WSL''s rulebook page next time one is downloaded.'),

  ('tour', NULL, 'artefacts.fetched_at for the six rulebook PDFs',
   'fetched_at is the file mtime on disk — when the bytes landed in the working tree, not an observed download timestamp. The column is NOT NULL so a value had to be written; this note is what stops it being read as a retrieval record.',
   'All future artefacts should record fetched_at at the moment of retrieval, per the sidecar convention in CLAUDE.md.');

COMMIT;


-- =====================================================================
-- RUN THESE IMMEDIATELY AFTER. All four must return zero rows.
--
--   SELECT * FROM v_band_occupancy_check;
--   SELECT * FROM v_round_template_band_disagreements;
--   SELECT * FROM v_round_template_flow_disagreements;
--   SELECT * FROM v_provenance_gaps;
--
-- The second is the one worth watching. It joins two independently
-- sourced things — the round structure from rulebook 1.06(a)/(b), the
-- band widths from Appendix A — and asserts they describe the same 36 or
-- 24 surfers. If it is empty, the QF/SF/Final outcomes carried as
-- `assumed` in round_template_outcomes are upgraded from an assumption
-- to an arithmetic consequence.
--
-- These two are NOT expected to be empty and should be read, not gated:
--
--   SELECT * FROM v_round_template_outcome_gaps;   -- the four Finals rounds
--   SELECT * FROM data_gaps WHERE closed_at IS NULL;
-- =====================================================================
