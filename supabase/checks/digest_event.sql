-- digest_event.sql — canonical row digests for one loaded event
--
-- Usage:
--   psql "$URL" -v season=2025 -v event=1 -f supabase/checks/digest_event.sql
--
-- WHY THIS FILE EXISTS
-- --------------------
-- On 13 August 2026 four digests were computed ad hoc during the session that
-- ran the first ingest, recorded in docs/CURRENT_MILESTONE.md as rounds
-- 482c728b…, surfers 6f0c3a0b…, heats 69c11162…, heat entries 7fc712d7…, and
-- cited as the evidence that the loaded rows matched the bytes on disk. The SQL
-- was not retained with the file, so a verification that had been presented as
-- a check was, for most of those values, a claim.
--
-- ONE of the four survived: the rounds digest. Its serialisation was recovered
-- on 17 August, reproduced twice from Cowork against the live database — once
-- before that night's ingest existed and once after — and reproduced a third
-- time here against all three loaded events. It is preserved verbatim below as
-- the cross-session anchor and must not be reformatted.
--
-- The other THREE — surfers 6f0c3a0b…, heats 69c11162…, heat entries 7fc712d7…
-- — remain unreproduced. The forms below are new, and will not match them. That
-- is expected: a different serialisation gives a different hash over identical
-- data. Treat those three as superseded rather than as a baseline, and do not
-- attempt to recover them by permuting formats until one matches — fitting a
-- serialisation to a known answer manufactures a confirmation.
--
-- From here on both halves live in git, so every future digest is comparable to
-- every other and to the anchor.
--
-- CANONICAL FORM
-- --------------
-- One line per row, fields separated by '|', lines sorted by their own text and
-- joined with newline, hashed as UTF-8. Deliberately:
--   * surrogate keys (id, *_id) are EXCLUDED — they are assigned by the
--     database and differ between any two loads of the same source bytes.
--   * natural keys and published values are INCLUDED — those are what must not
--     drift.
--   * numerics are cast to text via trim_scale() so 17.60 and 17.6 hash alike,
--     matching how the page publishes them (trap 16).
--   * NULL renders as the empty string, so an empty trailing field is stable.
--   * sorting is on the assembled line, so it is case-sensitive and locale
--     independent (C collation forced).

\set ON_ERROR_STOP on

with
-- ROUNDS — the cross-session anchor. DO NOT "improve" this serialisation.
--
-- This is the one 13 August digest that IS reproducible. It returns
-- 482c728bef55fceba1b910e3b245b7888b5eb96cec4b7801002cce7f03870453
-- and was reproduced independently from Cowork on 17 August, twice, before
-- and after that night's ingest. Reproduced again here against all three
-- loaded events. It is the only value that ties today's database back to the
-- 13 August record, so its exact form is load-bearing:
--
--   * concat_ws, NOT '||' — it DROPS a NULL wsl_code entirely rather than
--     emitting an empty field. A coalesce(wsl_code,'') form gives a different
--     and equally valid digest that is not this one.
--   * max_heat_score renders at its stored scale, '20.00', with no trim_scale.
--   * is_leaderboard renders 'f', not 'false'.
--   * ordering is plain `order by x`. Every line here is ASCII and prefixed by
--     a distinct round_order, so C and default collation agree.
--
-- CAVEAT, and it matters: this digest is IDENTICAL for all three loaded events,
-- because every pre_cut_36 event has the same seven round names and the same
-- rulebook constants. It therefore CANNOT detect rounds attached to the wrong
-- event. Only the heats and heat_entries digests can — they carry wsl_heat_id.
-- Do not read a matching rounds digest as evidence that an event is correctly
-- assembled; read it as evidence that the round template has not drifted.
rounds_d as (
  select encode(sha256(convert_to(string_agg(x, E'\n' order by x), 'UTF8')), 'hex') as d
  from (
    select concat_ws('|', r.round_order, r.wsl_code, r.name, r.counting_rides,
                          r.max_heat_score, r.scoring_basis, r.is_leaderboard) as x
    from rounds r
    join events e on e.id = r.event_id
    where e.season_year = :season and e.event_number = :event
  ) t
),
heats_d as (
  select encode(sha256(convert_to(coalesce(string_agg(line, E'\n' order by line collate "C"), ''), 'UTF8')), 'hex') as d
  from (
    select r.round_order || '|' || h.heat_number || '|' ||
           coalesce(h.sequence_in_round::text, '') || '|' ||
           coalesce(h.wsl_heat_id::text, '') || '|' || coalesce(h.status, '') as line
    from heats h
    join rounds r on r.id = h.round_id
    join events e on e.id = r.event_id
    where e.season_year = :season and e.event_number = :event
  ) t
),
surfers_d as (
  select encode(sha256(convert_to(coalesce(string_agg(line, E'\n' order by line collate "C"), ''), 'UTF8')), 'hex') as d
  from (
    select distinct coalesce(s.wsl_athlete_id::text, '') || '|' || s.full_name || '|' ||
           coalesce(s.country_code, '') as line
    from surfers s
    join heat_entries he on he.surfer_id = s.id
    join heats h on h.id = he.heat_id
    join rounds r on r.id = h.round_id
    join events e on e.id = r.event_id
    where e.season_year = :season and e.event_number = :event
  ) t
),
entries_d as (
  select encode(sha256(convert_to(coalesce(string_agg(line, E'\n' order by line collate "C"), ''), 'UTF8')), 'hex') as d
  from (
    select coalesce(h.wsl_heat_id::text, '') || '|' || coalesce(s.wsl_athlete_id::text, '') || '|' ||
           coalesce(he.position::text, '') || '|' ||
           coalesce(trim_scale(he.heat_total)::text, '') || '|' ||
           coalesce(he.finished_position::text, '') || '|' ||
           coalesce(he.progression_text, '') as line
    from heat_entries he
    join heats h on h.id = he.heat_id
    join rounds r on r.id = h.round_id
    join events e on e.id = r.event_id
    join surfers s on s.id = he.surfer_id
    where e.season_year = :season and e.event_number = :event
  ) t
)
select 'rounds'  as tbl, (select d from rounds_d)  as digest
union all select 'heats',        (select d from heats_d)
union all select 'surfers',      (select d from surfers_d)
union all select 'heat_entries', (select d from entries_d);
