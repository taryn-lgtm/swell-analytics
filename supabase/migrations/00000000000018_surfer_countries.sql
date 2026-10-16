-- 00000000000018_surfer_countries.sql
-- Surfer nationality as WSL publishes it, for M4's national palettes (approved by Taryn, 7 October 2026).
--
-- WSL's results pages publish a country NAME on each athlete (the flag's title, e.g. 'Hawaii'),
-- never a 3-letter code: a search of every retained page for 16 likely codes found none.
-- Taryn's decision, 7 October: store the published name. countries.code therefore holds the name
-- exactly as published, and iso_alpha3 stays NULL. Nothing is mapped or derived.
--
-- Provenance: each surfer's country cites the first retained artefact that publishes it, paired
-- under a CHECK exactly as venue_id / venue_artefact_id are (migration 13).
-- Source: docs/findings/2026-10-07_surfer_countries.md. 92 athletes parsed, 0 with two countries,
-- 73 of 73 v2 surfers matched. Every cited artefact's sha256 was re-checked against disk.

BEGIN;

COMMENT ON COLUMN countries.code IS
  'The country exactly as WSL publishes it on its results pages: the athlete flag''s title, e.g. ''Brazil'', ''Hawaii''. WSL publishes no 3-letter code in any retained artefact (checked 7 October 2026), so none is stored. Hawaii is kept separate because WSL keeps it separate. iso_alpha3 is NULL by design until a published source supplies one.';

INSERT INTO countries (code, name, iso_alpha3, notes) VALUES
  ('Australia', 'Australia', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Brazil', 'Brazil', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('El Salvador', 'El Salvador', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Fiji', 'Fiji', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('France', 'France', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('French Polynesia', 'French Polynesia', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Hawaii', 'Hawaii', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Indonesia', 'Indonesia', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Italy', 'Italy', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Japan', 'Japan', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Mexico', 'Mexico', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Morocco', 'Morocco', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('Portugal', 'Portugal', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('South Africa', 'South Africa', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.'),
  ('United States', 'United States', NULL, 'Published name, results-page flag title. Added 7 Oct 2026.');

ALTER TABLE surfers
  ADD COLUMN country_artefact_id bigint REFERENCES artefacts(id);

ALTER TABLE surfers
  ADD CONSTRAINT surfers_country_provenance_check
  CHECK ((country_code IS NULL) = (country_artefact_id IS NULL));

COMMENT ON COLUMN surfers.country_artefact_id IS
  'The retained artefact that publishes this surfer''s country (the first, in file order, of the results pages that do). Paired with country_code under surfers_country_provenance_check.';

UPDATE surfers s SET country_code = v.country_code, country_artefact_id = v.artefact_id
FROM (VALUES
  (8, '9341', 'Mexico', 36),
  (9, '9167', 'Brazil', 440),
  (10, '9112', 'Indonesia', 191),
  (11, '8907', 'Hawaii', 191),
  (12, '8784', 'Brazil', 191),
  (13, '708', 'Brazil', 36),
  (14, '7012', 'United States', 191),
  (15, '6963', 'Australia', 191),
  (16, '688', 'Brazil', 191),
  (17, '564', 'South Africa', 191),
  (18, '553', 'United States', 191),
  (19, '4491', 'Hawaii', 191),
  (20, '4133', 'Australia', 191),
  (21, '3994', 'Brazil', 191),
  (22, '3962', 'Hawaii', 191),
  (23, '3955', 'Hawaii', 191),
  (24, '3896', 'Japan', 191),
  (25, '3737', 'South Africa', 191),
  (26, '3694', 'France', 256),
  (27, '3442', 'Australia', 191),
  (28, '3165', 'United States', 191),
  (29, '3122', 'United States', 191),
  (30, '2838', 'Japan', 191),
  (31, '2760', 'Brazil', 191),
  (32, '2656', 'Italy', 191),
  (33, '2618', 'Hawaii', 191),
  (34, '199', 'Hawaii', 191),
  (35, '1760', 'Australia', 191),
  (36, '1737', 'Brazil', 191),
  (37, '15456', 'Brazil', 36),
  (38, '1456', 'Brazil', 191),
  (39, '1349', 'Morocco', 191),
  (40, '10988', 'Australia', 36),
  (41, '1089', 'Brazil', 36),
  (42, '10786', 'Hawaii', 191),
  (43, '10776', 'Australia', 306),
  (116, '9853', 'United States', 191),
  (140, '2660', 'France', 65),
  (142, '2654', 'France', 65),
  (148, '1343', 'Portugal', 191),
  (152, '9981', 'United States', 68),
  (187, '10252', 'El Salvador', 440),
  (189, '9654', 'Australia', 191),
  (192, '8905', 'United States', 191),
  (209, '3047', 'Australia', 191),
  (218, '14110', 'Hawaii', 191),
  (221, '1291', 'Brazil', 191),
  (222, '1085', 'Brazil', 191),
  (225, '9817', 'Hawaii', 206),
  (227, '9591', 'Hawaii', 206),
  (254, '1677', 'Hawaii', 206),
  (268, '621', 'France', 256),
  (289, '13936', 'Portugal', 256),
  (295, '10144', 'Portugal', 256),
  (297, '9680', 'Australia', 306),
  (301, '8801', 'Australia', 306),
  (343, '4336', 'Australia', 356),
  (361, '17329', 'Australia', 356),
  (381, '3616', 'French Polynesia', 406),
  (462, '1331', 'Fiji', 508),
  (954, '10781', 'Australia', 704),
  (962, '8738', 'Australia', 721),
  (988, '13234', 'Australia', 721),
  (1014, '12717', 'United States', 771),
  (1024, '482', 'Brazil', 801),
  (1037, '16226', 'Brazil', 801),
  (1062, '12466', 'South Africa', 835),
  (1068, '8990', 'France', 59),
  (1085, '14571', 'French Polynesia', 869),
  (1130, '7551', 'Brazil', 59),
  (1155, '14077', 'Indonesia', 59),
  (2932, '763', 'Australia', 3691),
  (2944, '3807', 'Australia', 3690)
) AS v(id, wsl_athlete_id, country_code, artefact_id)
WHERE s.id = v.id AND s.wsl_athlete_id = v.wsl_athlete_id;

-- Guard: every surfer must now carry a country, and the id/athlete-id pairs must all have matched.
DO $$
BEGIN
  IF (SELECT count(*) FROM surfers WHERE country_code IS NULL) <> 0 THEN
    RAISE EXCEPTION 'surfer countries: % surfers still without a country', (SELECT count(*) FROM surfers WHERE country_code IS NULL);
  END IF;
END $$;

COMMIT;
