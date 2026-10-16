# M1 schema design — WSL Analytics 2.0

**Drafted:** 29 July 2026
**Status:** PROPOSED — for sign-off. No SQL has been run and no project has been created.
**Milestone:** M1 item 1.
**Built from:** `docs/format-spec/seasons/*.yaml`, `docs/format-spec/POOL_EVENTS.md`, and the
gap analysis in `docs/findings/2026-07-29_supabase_state.md` §6.
**Not built from:** the v1 schema, which is quarantined. Where v1 got something right, that is
noted and the decision re-derived rather than inherited.

---

## The three rules this schema exists to enforce

Everything below follows from these. If a table seems over-built, it is one of these three.

1. **A value with no source is not a value.** Every fact carries provenance to a retained
   artefact, or it is `null` with a recorded reason. v1 failed because plausible guesses and
   real data were indistinguishable once written.
2. **Two independent signals, asserted to agree.** Where WSL publishes something the project
   also derives — the throwaway above all — store both and check them against each other.
   A derivation that agrees with the source is evidence; a derivation alone is a guess.
3. **Era-awareness is structural, not conditional.** No `IF year >= 2022` in application code.
   The rules live in rows, keyed by era, so a new era is data rather than a code change.

---

## Table list

Sixteen tables. Nine hold data for M1; the rest are reference, provenance or explicitly
unpopulated.

| Table | Purpose | Populated in M1 |
|---|---|---|
| `artefacts` | Retained raw source files, one row per fetch | Yes |
| `eras` | Era definitions and their governing rules | Yes — Era A only |
| `points_bands` | Position → points, keyed by era | Yes |
| `countries` | ISO reference | Yes |
| `venues` | Break/pool locations | Yes |
| `surfers` | Athlete identity | Yes |
| `seasons` | One row per season, with cut and champion | Yes |
| `events` | One row per CT event | Yes |
| `rounds` | **New.** One row per round within an event | Yes |
| `heats` | One row per heat within a round | Yes |
| `heat_entries` | One row per surfer per heat | Yes |
| `waves` | One row per scoring ride | Yes |
| `event_entries` | One row per surfer per event — placing, points, participation | Yes |
| `season_rankings` | Published end-of-season standings | Yes |
| `data_gaps` | Known-missing data, with reason | Yes |
| `interferences` | Full interference records | **No** — carried unpopulated |

---

## 1. Provenance — `artefacts`

The table everything else points at. Nothing else works without it.

```sql
CREATE TABLE artefacts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url             text,
  file_path       text NOT NULL,          -- docs/sources/raw/...
  sha256          char(64) NOT NULL,
  fetched_at      timestamptz NOT NULL,
  http_status     integer,
  content_type    text,
  content_length  bigint,
  retrieval       text NOT NULL,          -- how it was obtained
  notes           text,
  CONSTRAINT artefacts_retrieval_check CHECK (retrieval IN (
    'manual_browser_save',    -- personal use, ToU 7(F)
    'script_own_ua',          -- reconstruct_season.ts, pre-26-July only
    'published_pdf',          -- rulebooks
    'third_party'             -- e.g. the nxtbets article
  )),
  UNIQUE (sha256)
);
```

**`retrieval` is not decoration.** The Terms of Use finding means the project must be able to
answer "how did you obtain this?" per row, permanently. `script_own_ua` should appear on
exactly one artefact — the 2024 rankings page, which predates the 26 July finding — and never
again unless WSL grants permission.

**Every table below carries `artefact_id`** on the rows that assert facts. Where a fact is
derived rather than read, it carries `derived_from` instead and the two are mutually exclusive.

---

## 2. Era rules as data — `eras`, `points_bands`

```sql
CREATE TABLE eras (
  code                    char(1) PRIMARY KEY,     -- 'A', 'B', 'C'
  name                    text NOT NULL,
  first_season            integer NOT NULL,
  last_season             integer,
  has_mid_season_cut      boolean NOT NULL,
  has_wsl_finals          boolean NOT NULL,
  champion_is_points_leader boolean NOT NULL,
  throwaway_form          text,     -- 'counting_events' for A
  throwaway_eligibility   text,     -- 'pre_cut_only' for A
  notes                   text
);

CREATE TABLE points_bands (
  era_code    char(1) NOT NULL REFERENCES eras(code),
  position    integer NOT NULL,       -- band label: 1,2,3,5,9,17,33
  points      integer NOT NULL,
  band_width  integer NOT NULL,       -- 1,1,2,4,8,16,4 — how many surfers share it
  artefact_id bigint REFERENCES artefacts(id),
  source_note text,
  PRIMARY KEY (era_code, position)
);
```

**Why `band_width` is stored rather than computed.** It is the fact that closes the
closing-rounds derivation in `docs/findings/2026-07-29_rulebook_provenance.md` §3 — four QF
losers into a four-wide band, two SF losers into a two-wide band. Storing it makes that
derivation checkable by a query rather than by argument.

**`points_bands` is era-scoped and has no multiplier column.** There is no Pipe multiplier in
Era A. If 2026 needs one it gets its own era row and its own bands, which is what the 2026
book's elevated Pipe column actually is.

---

## 3. Season, cut, champion — `seasons`

```sql
CREATE TABLE seasons (
  year                        integer PRIMARY KEY,
  era_code                    char(1) NOT NULL REFERENCES eras(code),
  cut_after_event             integer,
  cut_positions               integer,          -- 22 in Era A
  cut_source_artefact_id      bigint REFERENCES artefacts(id),
  cut_source_grade            text,             -- see CHECK below
  cut_source_note             text,
  pre_cut_event_count         integer NOT NULL, -- P, for the throwaway rule
  world_champion_surfer_id    bigint REFERENCES surfers(id),
  champion_artefact_id        bigint REFERENCES artefacts(id),
  CONSTRAINT seasons_cut_grade_check CHECK (cut_source_grade IN (
    'declarative', 'corroborating', 'interpolated', 'unsourced'
  )),
  CONSTRAINT seasons_cut_grade_requires_source CHECK (
    (cut_source_grade = 'unsourced' AND cut_source_artefact_id IS NULL)
    OR (cut_source_grade <> 'unsourced' AND cut_source_artefact_id IS NOT NULL)
  )
);
```

**`cut_source_grade` is the category the spec has needed since 28 July and does not have.**
Rule 1.09(c) is conditionally phrased; the points table for 2023 and 2024 is bracketed by
identical endpoints. Neither is `null` and neither is a clean citation. Forcing them into a
boolean sourced/unsourced is what makes people round up.

The second CHECK makes it impossible to claim a grade without an artefact behind it. **2024's
cut is `unsourced` and 2023's is at best `corroborating` from a 2022-season book** — see
`docs/findings/2026-07-29_rulebook_provenance.md`.

**`world_champion_surfer_id` is a column, never a query.** 2024 settles it: Colapinto finished
on 46,600 against Ferreira's 37,365 and ranked below him.

---

## 4. Events, and the two meanings of "post-cut" — `events`

```sql
CREATE TABLE events (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_year           integer NOT NULL REFERENCES seasons(year),
  event_number          integer NOT NULL,      -- ORDER FROM THE CALENDAR
  wsl_event_id          text,                  -- NOT an ordering key
  name                  text NOT NULL,
  slug                  text NOT NULL,
  venue_id              bigint REFERENCES venues(id),
  start_date            date,
  end_date              date,
  kind                  text NOT NULL,
  occurs_after_cut      boolean NOT NULL,
  throwaway_eligible    boolean NOT NULL,
  awards_ranking_points boolean NOT NULL DEFAULT true,
  field_size            integer,
  artefact_id           bigint REFERENCES artefacts(id),
  CONSTRAINT events_kind_check CHECK (kind IN ('regular', 'wsl_finals')),
  UNIQUE (season_year, event_number)
);
```

**`occurs_after_cut` and `throwaway_eligible` are two columns, not one.** v1 had a single
`is_post_cut` carrying both meanings, and their relationship is season-dependent — in 2021 any
event was droppable, from 2022 only pre-cut ones are. One boolean cannot be era-aware.

**`awards_ranking_points` is `false` for the WSL Finals.** It reallocates the top five
positions instead of awarding points. Modelling it as a points event double-counts.

**No `points_multiplier` column.** Deliberate — see §2.

**`event_number` comes from the calendar and `wsl_event_id` is inert.** 2022 runs 2, 3, 6, 9,
5, 8, 12, 7, 4, 11, 10. The other three seasons are sequential, which is what makes this an
easy trap.

---

## 5. Rounds as a table — the biggest change from v1

```sql
CREATE TABLE rounds (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id          bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_order       integer NOT NULL,
  wsl_code          text,          -- 'NS' — what WSL publishes
  name              text,          -- expansion; NULL when unsourced
  counting_rides    integer,       -- 2 normally, 1 for the NS round at Surf Ranch
  max_heat_score    numeric(4,2),  -- 20.00 normally, 10.00 for NS
  scoring_basis     text,          -- see CHECK
  is_leaderboard    boolean NOT NULL DEFAULT false,
  artefact_id       bigint REFERENCES artefacts(id),
  CONSTRAINT rounds_scoring_check CHECK (scoring_basis IN (
    'best_two_overall',       -- ocean events
    'best_left_plus_right',   -- pool events
    'single_best_wave'        -- the NS round, 2023 Surf Ranch
  )),
  UNIQUE (event_id, round_order)
);
```

**This is the table v1 has no equivalent of, and it is the one the spec most requires.**
Scoring basis belongs to the round, not the event: within the 2023 Surf Ranch, the `NS` round
counts one wave to a maximum of 10.00 while every other round counts two to 20.00. With round
as a text column on `heats`, that fact has nowhere to live except repeated per heat.

**`wsl_code` and `name` are separate, and `name` is nullable.** `Adv to NS` is WSL's own text,
attested on 12 rows in 2023 and 24 in 2025. "Night Session" and "Night Round" are both
unsourced expansions and the project has carried one of them across three documents as if it
were fact. Record the code; leave the expansion `null` until a WSL page renders it in full.

**`is_leaderboard`** exists because the 2023 Surf Ranch `NS` round has no heats at all — it is
a single 12-man leaderboard. A schema assuming every round decomposes into heats breaks there.

---

## 6. Heats and entries

```sql
CREATE TABLE heats (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id        bigint NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  heat_number     integer,
  sequence_in_round integer,        -- for the best-of-three Finals Final Match
  wsl_heat_id     text,
  status          text NOT NULL DEFAULT 'completed',
  wave_height_ft  numeric,
  wind_direction  text,
  wind_speed_kts  numeric,
  tide            text,
  artefact_id     bigint REFERENCES artefacts(id),
  CONSTRAINT heats_status_check CHECK (status IN ('completed','abandoned','not_held'))
);

CREATE TABLE heat_entries (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_id           bigint NOT NULL REFERENCES heats(id) ON DELETE CASCADE,
  surfer_id         bigint NOT NULL REFERENCES surfers(id),
  position          integer,          -- parsed from 'Adv to R/32 - HT 8'
  heat_total        numeric(4,2),
  progression_text  text,             -- WSL's raw string, retained verbatim
  advanced_to_round_id bigint REFERENCES rounds(id),
  finished_position integer,          -- band label, when eliminated here
  artefact_id       bigint REFERENCES artefacts(id),
  UNIQUE (heat_id, surfer_id)
);
```

**`sequence_in_round` exists because a "Final" is not always one heat.** The WSL Finals Final
Match is best of three.

**`progression_text` is retained verbatim, not just parsed.** v1 had `position` null across all
10,588 heat rows because the progression string was never mapped — the data was on the page the
whole time. Keeping the raw string means a parsing bug is fixable without re-fetching, which
matters when re-fetching is prohibited.

**No `wave_1_score` / `wave_2_score` columns.** v1 had those *and* a `wave_scores` table — the
same fact in two places with nothing tying them. `heat_total` stays, because it is published
independently and is the check against the waves summing correctly.

---

## 7. Waves, with orientation

```sql
CREATE TABLE waves (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_entry_id bigint NOT NULL REFERENCES heat_entries(id) ON DELETE CASCADE,
  wave_order    integer NOT NULL,
  score         numeric(4,2) NOT NULL,
  counted       boolean NOT NULL,
  orientation   text,          -- 'left' | 'right' | NULL for ocean
  artefact_id   bigint REFERENCES artefacts(id),
  CONSTRAINT waves_orientation_check CHECK (orientation IN ('left','right')),
  UNIQUE (heat_entry_id, wave_order)
);
```

**`orientation` is nullable and that is correct, not lazy.** Pool heat totals are best-left
plus best-right, not best two overall. Ocean events have no orientation to record. A `NOT NULL`
here would force a fabricated value on 95% of rows — the exact failure being designed against.

**Scope note:** these are the *counting* waves — the best two per surfer per heat, rulebook
10.05(c) — which WSL does publish. Every non-counting ride, with times and judge-by-judge
breakdown, is not available anywhere. See
`docs/findings/2026-07-28_wave_level_availability.md`.

---

## 8. The table that would have prevented v1 — `event_entries`

```sql
CREATE TABLE event_entries (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id              bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  surfer_id             bigint NOT NULL REFERENCES surfers(id),
  placing               integer,
  points                integer,          -- published only. Never derived. See §8.1
  points_status         text NOT NULL,    -- why points is what it is
  participation         text NOT NULL,
  status                text NOT NULL DEFAULT 'competed',
  throwaway_published   boolean,     -- WSL's no-count class
  throwaway_derived     boolean,     -- ours
  artefact_id           bigint REFERENCES artefacts(id),
  CONSTRAINT ee_participation_check CHECK (participation IN (
    'ct_surfer', 'injury_replacement', 'event_wildcard'
  )),
  CONSTRAINT ee_status_check CHECK (status IN (
    'competed', 'injured_withdrawal', 'did_not_contest'
  )),
  CONSTRAINT ee_points_status_check CHECK (points_status IN (
    'published',      -- read from the rankings page. points IS NOT NULL
    'none_earned',    -- structurally zero: wildcard. points IS NULL, and that is correct
    'not_contested',  -- the cell rendered '-'. points IS NULL, and that is correct
    'unread'          -- SHOULD have a value and does not. A FAILURE. Needs a data_gaps row
  )),
  CONSTRAINT ee_points_status_agrees CHECK (
    (points_status = 'published' AND points IS NOT NULL)
    OR (points_status <> 'published' AND points IS NULL)
  ),
  CONSTRAINT ee_wildcards_score_nothing CHECK (
    participation <> 'event_wildcard' OR points IS NULL
  ),
  UNIQUE (event_id, surfer_id)
);
```

### 8.1 Points precedence — read vs derived

**Resolved 29 July. This was the open question that blocked ingest.**

The project has already answered this once, for the throwaway: *capture the published flag as
a field, derive it independently, and assert agreement as a standing audit — do not derive
alone and treat the result as truth.* Points is the same shape and gets the same answer,
because inventing a second, different rule for the same problem is how two parts of a system
start disagreeing quietly.

**The rule:**

1. **`points` is only ever the published value.** Read from the rankings page cell for that
   surfer and event. Never written by a derivation, under any circumstance.
2. **The derived value is never stored.** It is a pure function of `placing`,
   `participation` and `points_bands`, so it belongs in a view — `v_points_reconciliation` —
   recomputed on demand. Storing it would let a later correction to `points_bands` leave a
   stale column behind, which is drift by construction.
3. **Disagreement is a hard failure, not a preference.** The reconciliation gate asserts
   published equals derived for every row where both exist. A mismatch means one of three
   things is wrong — the parse, the band table, or the participation type — and all three are
   worth stopping for. Do not add a tolerance.
4. **Where the two cannot both exist, say which and why.** That is what `points_status` is
   for.

**Why `points_status` is `NOT NULL` and has four values rather than being a nullable integer.**
A wildcard's missing points and a dropped table cell are both `NULL`. The first is correct;
the second is the v1 failure arriving through a different door. The `ee_points_status_agrees`
constraint makes the two impossible to confuse, and `'unread'` is deliberately ugly to write
— an ingest that produces one should feel like it has failed, because it has.

**Consequence for ingest order.** Participation type must be known *before* points are
written, since it decides whether an absent value is `'none_earned'` or `'unread'`. The
rankings page carries both, so this is an ordering constraint within one parse, not a second
fetch.

**`participation` is the single most important column in this schema.** Wildcards take a
finishing placing and earn no ranking points. Deriving points from placing alone silently
awards points nobody earned, to a whole cohort, raising no error. That is the v1 failure shape
exactly, and `ee_wildcards_score_nothing` makes it a constraint violation rather than a
plausible number.

**`status` is separate from `participation`** because an injured withdrawal keeps its earned
placing and points. Two different questions: what kind of entrant, and what happened to them.

**Two throwaway columns, deliberately.** WSL publishes the dropped event — a `no-count` class
and a `Throwaway` tooltip. The project also derives it from best (P−1) of P eligible events.
Store both and assert agreement as a standing audit. Deriving alone and treating the result as
truth is how a rule that is 95% right becomes invisible for the other 5%.

**`points` is nullable, and `placing` and `points` are independent.** A non-contested event
renders `-`, not an empty cell. A short row is a parse failure, never a surfer who missed
events.

---

## 9. Published rankings, and honest gaps

```sql
CREATE TABLE season_rankings (
  season_year   integer NOT NULL REFERENCES seasons(year),
  surfer_id     bigint NOT NULL REFERENCES surfers(id),
  rank          integer NOT NULL,
  points_total  integer NOT NULL,
  artefact_id   bigint NOT NULL REFERENCES artefacts(id),
  PRIMARY KEY (season_year, surfer_id)
);

CREATE TABLE data_gaps (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope         text NOT NULL,      -- 'event' | 'round' | 'heat' | 'season'
  scope_id      bigint,
  season_year   integer,
  field         text NOT NULL,      -- what is missing
  reason        text NOT NULL,      -- why
  source_note   text,
  opened_at     date NOT NULL DEFAULT current_date,
  closed_at     date
);
```

**`season_rankings.artefact_id` is `NOT NULL`** — the only table where it is. These are the
authority the whole reconciliation gate runs against. A published ranking with no artefact
behind it is not a published ranking.

**`data_gaps` is how M1 item 5 is satisfied without fabricating anything.** A missing wave
score is either present, or a row here with a reason. Silent absence is a failure.

---

## 10. Carried, unpopulated

```sql
CREATE TABLE interferences (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  heat_id         bigint NOT NULL REFERENCES heats(id),
  offender_id     bigint NOT NULL REFERENCES surfers(id),
  against_id      bigint REFERENCES surfers(id),
  wave_id         bigint REFERENCES waves(id),
  penalty_level   text NOT NULL,
  artefact_id     bigint REFERENCES artefacts(id),
  CONSTRAINT interference_level_check CHECK (penalty_level IN ('1','2','3','disqualification'))
);
```

Interference is a full record — who, against whom, which wave, what penalty — not a boolean.
Rule 11.17 defines four levels that alter ride *values*. **Not published as structured data
anywhere on the WSL site**, so this stays empty in M1 and the absence is recorded in
`data_gaps`.

**No Datum or Trim tables.** M2, and `PROJECT_PLAN.md` is explicit that predictions tables are
not created speculatively. The naming decision is also still open, and these become column
names.

---

## What this design does not yet settle

Stated so they are decided rather than discovered.

1. ~~**Are `points` on `event_entries` read or derived?**~~ **RESOLVED 29 July — §8.1.**
   Published only; derived lives in a view and is an audit check; `points_status` distinguishes
   correctly-absent from failed-to-read. This was the one that blocked ingest.
2. **Pool event placings.** A surfer eliminated 3rd on a 12-man leaderboard has a leaderboard
   rank, not a bracket placing. Whether that maps to the standard Appendix B bands is
   unverified — `POOL_EVENTS.md` §5, both `BLOCKING: true` flags still up.
3. **Trials rounds** — do they belong to the event, and do they award points? Open.
4. **`heat_entries.finished_position` vs `event_entries.placing`.** Related but not identical;
   the second is the event outcome, the first is where a surfer stopped. Confirm they
   reconcile before relying on either.

---

## Application

Not yet. This is for review.

When signed off, it becomes `supabase/migrations/00000000000001_m1_schema.sql` against the new
project, applied by Taryn. Claude prepares and verifies; production writes stay with Taryn.
