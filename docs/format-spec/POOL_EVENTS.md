# Pool events — Era A

**Status:** partially sourced. Not signed off.
**Written:** 28 July 2026
**Covers:** the two Wave System (WS) events in Era A — 2023 Surf Ranch Pro (event 6),
2025 Surf Abu Dhabi Pro (event 2). "Pool event" is this project's term; WSL's is in §1.

---

## 0. Why this file exists

`docs/archive/WSL_HANDOVER_2026-07-26.md` §9 and `HANDOVER.md` §9 both cite a
`docs/format-spec/POOL_EVENTS.md` as the source for the pool event structures. **No such file
existed.** The structures were being asserted in successive handovers with no backing document
anywhere in the repo.

This file replaces that gap. It does **not** close the sourcing question. Read §5 before
treating anything here as settled.

**A note on what this file changes.** Before it, the 2023 and 2025 structures were undocumented
*and* unsourced. After it, 2023 is documented with a graded secondary source and 2025 is
documented and explicitly `source: null`. That is a real improvement and it is not sign-off.

---

## 1. What the rulebooks actually say — Chapter 8

`era_a.yaml:205` records:

```yaml
pool_events:
  specified_in_rulebook: false
  source: rulebook 2.02, 12.xx
  note: >
    The rulebooks permit alternate formats for events held in Artificial Wave
    Systems, subject to approval by the Commissioner's Office, but do not specify
    them.
```

### WSL's defined term changed between the 2022 and 2023 books

The glossary definition is word-for-word identical across all six books. **The term it defines is
not.**

| Books | Defined term |
|---|---|
| 2020, 2022 | **Wave Pool Events** |
| 2023, 2024, 2025, 2026 | **Wave System Events** |

> *[Wave Pool / Wave System]* **Events** are Events that are held in a man-made basin where all
> forces creating the wave are artificial.

Abbreviated **WS** in the chapter headings of every book, including the two that define "Wave
Pool" — so the abbreviation predates the term it now stands for.

**Search on both terms.** A source hunt using only "Wave System" will miss 2020–2022 material, and
one using only "pool" will miss everything from 2023 on. This project's own "pool event" vocabulary
matches WSL's older term, not its current one.

### Chapter 8 is the governing clause, and it is a pure delegation

**`CHAPTER 8: WAVE SYSTEM ("WS") EVENT RULES` is present in all six held rulebooks** — 2020, 2022,
2023, 2024, 2025, 2026. What is quoted below is the entire chapter. It specifies no format, no
scoring basis and no heat structure. It says only that the rules will be supplied elsewhere.

| Rulebook | Chapter 8, in full |
|---|---|
| 2020, 2022, 2023 | "The Rules in this Chapter are applicable to all competitive surfing Events that are conducted in a WS. In advance of any Event conducted in a WS, **the Office of Tours and Competition** will provide **the rules** for the Event to the Surfers competing in the Event **at least fourteen (14) days prior** to the start of the Event." |
| 2024, 2025 | "In advance of any Event conducted in a WS, **the WSL Commissioners Office** will provide **the rules and format** for the Event to the Surfers competing in the Event at least fourteen (14) days prior to the start of the Event." |
| 2026 | "In advance of any Event conducted in a WS, **the WSL Office of Tours & Competition** will provide the rules and format for the Event to the Surfers competing in the Event at least fourteen (14) days prior to the start of the Event." |

Chapter 8 applies to **all** WSL events held in a WS, CT included. It is not tour-specific.

### The current spec note is wrong on the citation and on the authority

`2.02` is Upgrading/Downgrading an Event. `12.xx` is Personal Watercraft Guidelines. **Neither has
anything to do with wave systems.** The correct citation is **Chapter 8**, which carries no rule
number.

The note also names "the Commissioner's Office" as the approving authority. Per the table above
that holds only for 2024 and 2025. **For 2022 and 2023 it was the Office of Tours and
Competition** — which matters, because the 2023 Surf Ranch Pro falls in that window.

### Two look-alike clauses that are NOT the governing rule

Searching for the phrase "Artificial Wave Systems" — as opposed to the defined term "Wave System
Event" — returns two further clauses, in the 2024, 2025 and 2026 books only:

- **Rule 2.08**, *Chapter 2 — QS and Challenger Series*: "WSL can implement alternate formats for
  events which are held in Artificial Wave Systems. All formats to be approved by the WSL Tour
  Representative."
- **Rule 4.07(d)**, *Chapter 4 — Longboard*: same sentence, approval by "the Commissioners Office"
  (2024, 2025) or "the Office of Tours & Competition" (2026).

**Neither is a CT rule**, and both are absent from the 2020, 2022 and 2023 books. The
"Commissioner's Office" wording in the current spec note traces to 4.07(d) — a Longboard rule read
across to the Championship Tour. Do not cite either for a CT event.

### The consequence that matters

**A primary source exists for every WS event, by rule.** Chapter 8 obliges WSL to give competing
surfers the rules and format at least fourteen days beforehand. So a written WSL format document
exists for both the 2023 Surf Ranch Pro and the 2025 Surf Abu Dhabi Pro.

**It goes to competitors, not necessarily to the public.** That reframes §5.1 and §5.2: what to
look for is not only a press release but a competitor-facing format document, which may not be on
the website at all.

It also sharpens the `legal@worldsurfleague.com` route in `HANDOVER.md` §3. A
request for two named Chapter 8 format documents is narrow, specific, and asks only for something
the rulebook already obliges WSL to produce — a better first approach than a general data licence.

Taryn's independent finding — **no official WSL ruling on wave systems published since 2021**
(28 July 2026) — is consistent with all of this. Chapter 8 has not changed in substance since 2020;
only the named office has. What is missing is the per-event documents Chapter 8 points to.

A correction to `era_a.yaml` is proposed separately. It is not applied in this file.

---

## 2. 2023 Surf Ranch Pro — structure

**Event 6, WSL event id 71. Lemoore, California. 27–28 May 2023. Post-cut, 24 men.**
**`throwaway_eligible: false`.**

**Source:** `docs/sources/raw/nxtbets_2023_surf_ranch_format.md`, sidecar
`nxtbets_2023_surf_ranch_format.json`. **Grade: SECONDARY — see §5.1.**

### Rounds

| Round | Heats | Heat size | Scoring basis | Outcomes |
|---|---|---|---|---|
| Qualifying Round | 6 | 4 | best left + best right (max 20.00) | 1st → Quarterfinals · 2nd, 3rd → Night Round · 4th eliminated |
| Night Round | **none — single leaderboard** | 12 (whole field) | **single best wave (max 10.00)** | 1st, 2nd → Quarterfinals · rest eliminated |
| Quarterfinals | 4 | 2 | best left + best right (max 20.00) | 1st advances |
| Semifinals | 2 | 2 | best left + best right (max 20.00) | 1st advances |
| Final | 1 | 2 | best left + best right (max 20.00) | 1st wins the event |

### Arithmetic check

6 heats × 4 = 24 ✓ matches the post-cut field.
6 heat winners → QF. 6 × 2 (2nd and 3rd) = 12 → Night Round. 12 + 6 + 6 = 24 ✓.
Night Round sends 2 to QF. 6 + 2 = **8**, filling a 4-heat Quarterfinal ✓.

The structure closes on itself. This is why the source is credible on structure despite §5.1.

### Score carry-over: none

Each round's score is computed from waves surfed in that round. No round's outcome depends on a
score earned in a previous round. **The feared schema-breaker does not occur here.**

### Round naming — a correction

Two names are attested, and they disagree.

| Name | Attested by | Strength |
|---|---|---|
| "Night Round" | nxtbets article (§5.1) | Secondary, and the same article miscounts waves |
| **"NS"** | WSL's own progression string, `Adv to NS`, on 12 Qualifying Round rows in 2023 and 24 in 2025 | WSL's own text, reached via quarantined v1 data |

**`NS` almost certainly expands to "Night Session"** — "Night Round" would abbreviate to NR. So
the handovers' "Night Session", which I first flagged as invented, is probably right, and the
nxtbets name is probably the one that is wrong.

**Corrected position: do not settle the name yet.** The abbreviation is WSL's, the expansion is
not. `Adv to NS` proves the round exists and that WSL has a code for it; it does not prove what
the code stands for. Record the round, record `NS` as the attested code, leave the expansion
`null` until a WSL page renders it in full.

The underlying point survives intact, and is now better evidenced: round names are data, never an
enum. Three project documents carried an expansion nobody had sourced, and this session first
"corrected" it to a worse one.

---

## 3. 2025 Surf Abu Dhabi Pro — structure

**Event 2, WSL event id 321. Hudayriyat Island, Abu Dhabi, UAE. 14–16 February 2025.**
**Pre-cut, 36 men. `throwaway_eligible: true`.**

**Source: `null` for scoring. Structure is now corroborated** — see below. The round-by-round
structure was reproduced from `HANDOVER.md` §9, which cites this file: a circular
citation, broken by recording it honestly.

**Corroboration found late in the session.** `data/wsl_2025_ct.csv` (quarantined v1 scrape)
carries WSL's published progression strings for this event:

- Qualifying Round, 36 surfers in 12 heats of 3 — **12 rows `Adv to R16 - HT n`, 24 rows
  `Adv to NS`**, totalling 36
- Round of 16 has 16 surfers, of whom only 12 are accounted for by the Qualifying Round

So **4 surfers reach the Round of 16 via NS**, exactly as the handover states. The NS round itself
is absent from the v1 data — see §4.3 for why.

This is not a source (v1 provenance, per `CLAUDE.md`), but the progression strings are WSL's own
published text and the arithmetic closes independently. Upgrade from "asserted" to "corroborated,
pending a primary source".

| Round | Heats | Heat size | Scoring basis | Outcomes |
|---|---|---|---|---|
| *(qualifying round)* | 12 | 3 | `null` — unsourced | 1st → Round of 16 · 2nd, 3rd → *(second round)* |
| *(second round)* | `null` | 24 | `null` — unsourced | 4 advance to Round of 16 |
| Round of 16 onward | `null` | `null` | `null` — unsourced | conventional bracket |

**Round names are in parentheses because they are unknown.** The handovers call the second round
"Night Session". No source attests that for this event, and the only WS source in the repo uses
"Night Round" for a different event in a different season (§2). Do not carry either name into a
data file until Abu Dhabi's own round names are sourced.

### Arithmetic check

12 × 3 = 36 ✓ matches the pre-cut field.
12 heat winners + 4 from the second round = **16** ✓ fills a Round of 16.
12 × 2 = 24 into the second round ✓.

**The arithmetic closing does not source the structure.** It shows the reproduced numbers are
self-consistent. Consistency is not provenance — see `HANDOVER.md` §14.

### `throwaway_eligible: true` — a risk worth naming

Unlike Surf Ranch, Abu Dhabi is a **pre-cut** event, so it enters the throwaway calculation
(2025 → best 6 of 7). Its points therefore affect final rankings directly. An unsourced format
on a throwaway-eligible event is a higher-consequence gap than the same gap on a post-cut event.

---

## 3A. This file covers two of five wave pool events — SCOPE WARNING

The project has been treating wave pool events as an Era A curiosity. **They are not.** Scanning
`data/*.csv` for every season 2015–2025 gives five:

| Season | Event | Venue | Era | In this file? |
|---|---|---|---|---|
| 2015–2017 | none | — | C | — |
| **2018** | Surf Ranch Pro | Surf Ranch, Lemoore | C | **No** |
| **2019** | **Freshwater Pro** | Surf Ranch, Lemoore | C | **No** |
| 2020 | season cancelled | — | — | — |
| **2021** | **Jeep Surf Ranch Pro** | Surf Ranch, Lemoore | B | **No** |
| 2022 | none | — | A | — |
| 2023 | Surf Ranch Pro | Surf Ranch, Lemoore | A | Yes, §2 |
| 2024 | none | — | A | — |
| 2025 | Surf Abu Dhabi Pro | Hudayriyat Island | A | Yes, §3 |

Note the event *names* differ — "Freshwater Pro" in 2019, "Jeep Surf Ranch Pro" in 2021. A search
on "Surf Ranch Pro" alone misses 2019.

**Structures, from the v1 CSVs — quarantined, not sources:**

| Season | Rounds | Shape |
|---|---|---|
| 2018 | 2 | Qualifying Round, all 36 in one group → Final of 8 |
| 2019 | 2 | "Round of 36", all 36 in one group → Final of 8 |
| 2021 | 3 | Qualifying Round 36 → Semifinal 8 → Final 2 |
| 2023 | 5 | Qual 6×4 → NS 12 → QF 4×2 → SF 2×2 → Final |
| 2025 | 6 | Qual 12×3 → NS 24 → R16 8×2 → QF → SF → Final |

**No two are the same.** Round count runs 2, 2, 3, 5, 6. The 2018/2019 events are not brackets at
all — a single 36-surfer group feeding an 8-surfer final. 2021 adds one knockout round. Only from
2023 does anything resembling a conventional bracket appear.

**Consequences:**

1. Era A generalisations about pool events will not survive contact with Eras B and C. Do not
   write any schema that assumes a bracket.
2. Requirement 3 below — a round may have no heats — is not an Era A edge case. It is how the
   2018 and 2019 events worked *entirely*.
3. Eras B and C are unstarted, so 3 of the 5 events have had no specification work at all.

---

## 4. Schema requirements arising

These hold regardless of how §5 resolves. All four are forced by the 2023 structure. That
structure rests on a secondary source with a known defect (§5.1), so treat these as **design
constraints to accommodate**, not as facts to hard-code. Each is cheap to support and expensive
to retrofit, which is why they are worth honouring ahead of sign-off.

1. **Waves need an orientation field.** A pool heat total is `best_left + best_right`, not
   best two overall. Nullable for ocean events.

   **Independently corroborated from 2018.** `scripts/generate_2018_surf_ranch_migration.py`
   (untracked, v1-era) parses the 2018 Surf Ranch Pro and *enforces* `best_left + best_right ==
   published_total` to ±0.01, raising on any row that fails. Run against
   `data/surf_ranch_2018_raw.txt` on 28 July 2026 it **exits 0 across all 44 rows** (36 qualifying
   + 8 final).

   Weigh this correctly. The underlying data is a v1 scrape of unknown per-row provenance and is
   quarantined — it is **not** a source. But the check is an arithmetic reconciliation against
   published heat totals, not a prose description, and it holds on 44 rows from a different
   season, a different era and a different data path than §2. As evidence for the *orientation
   rule* it is stronger than the nxtbets article. As evidence for anything about 2023, it is
   nothing at all.

   One incidental detail: 2018 gave each surfer **six** waves, three lefts and three rights,
   alternating L R L R L R. Bears on §5.1 without resolving it.

2. **Scoring basis belongs to the round, not the event.** Within the 2023 Surf Ranch Pro, the
   Night Round counts **one** wave (max 10.00) while every other round counts **two** (max 20.00).
   An event-level `counting_rides: 2` is wrong here. `era_a.yaml`'s `scoring.counting_rides: 2`
   (source: rulebook 10.05c) is a CT default that pool rounds override.

3. **A round may have no heats at all.** The 2023 NS round is explicitly *"no heats and only
   one single leaderboard"*, 12 surfers ranked against each other directly.

   **This is why v1 lost both NS rounds.** In `data/wsl_2023_ct.csv` and `wsl_2025_ct.csv`, 12 and
   24 surfers respectively carry `Adv to NS` — and **no NS round exists in either file**. The
   surfers advance and vanish. A heat-keyed schema cannot hold a round that has no heats, so the
   round was silently dropped, and with it the only path by which 2 of the 8 quarterfinalists
   (2023) and 4 of the 16 R16 surfers (2025) arrived.

   This is a v1 failure of exactly the documented shape: no error raised, the bracket still looked
   plausible, the data was wrong anyway. It is also the single strongest argument for this
   requirement — it has already cost the project data once.

   **This supersedes the handover's framing.** §9 of both handovers states the requirement as
   "heat sizes vary within a round — the Abu Dhabi Night Session is a single heat of 24". That
   models a leaderboard as a one-heat round. It is a workable encoding, but it is an
   interpretation, not what the source describes, and it was applied to the *unsourced* 2025
   event rather than the sourced 2023 one. Decide deliberately: either `heat` becomes nullable
   with a `leaderboard` round type, or leaderboard rounds are encoded as a single synthetic heat.
   **Do not let the choice be made accidentally by a schema that only permits one of them.**

4. **Round names are data, never an enum.** "Qualifying Round" and "Night Round" are not bracket
   vocabulary. See §2 for what happens when a name is carried without a source.

---

## 5. Open questions

### 5.1 The 2023 source is secondary and contains a known error — BLOCKING

`nxtbets.com` is a sports-betting affiliate site. The article reports a WSL announcement but does
not link it, and the underlying WSL release has not been located.

It was published **13 May 2023**, two weeks before the event ran on 27–28 May, so it is a
pre-event report of an announced format, not a retrospective reconstruction. That is a point in
its favour.

**It also contains an internal arithmetic error.** On the Qualifying Round:

> Each athlete will get four waves consisting of two lefts and three rights, alternating starting
> with lefts.

Two plus three is five. **The Qualifying Round wave allocation cannot be taken from this source.**

Note what this does to open question 6 in `HANDOVER.md` §13, recorded as
*"2023 Surf Ranch qualifying wave allocation — sources conflict"*. **It is not a conflict between
sources.** It is a self-contradiction inside the single source we have. Different problem,
different fix: no amount of weighing sources against each other resolves it, and only a primary
source will.

Everything else in the article is arithmetically self-consistent and cross-checks against known
field sizes (§2). **But one demonstrably wrong sentence means no sentence here carries sign-off
authority on its own.**

**To close:** obtain the Chapter 8 format document WSL was obliged to issue to competitors at
least fourteen days before 27 May 2023 (§1). A public format release would also do. Per
`HANDOVER.md` §3, Claude cannot fetch worldsurfleague.com; this needs Taryn's
browser, and the result should be retained with a proper sidecar.

### 5.2 The 2025 Abu Dhabi format is entirely unsourced — BLOCKING

§3. Nothing found. Higher consequence than 5.1 because the event is throwaway-eligible.

**To close:** the Chapter 8 document issued at least fourteen days before 14 February 2025, per
§1. Under the 2025 book that document came from the WSL Commissioners Office.

### 5.3 Do pool events use the standard Appendix B points table?

**Unverified.** Neither source addresses points. The Surf Ranch Pro is a post-cut event with a
24-man field, so the `post_cut_24` position bands (1st / 2nd / 3rd / 5th / 9th / 17th) would
apply if the standard table holds — but the round structure differs, and a Night Round
elimination has no obvious equivalent in the bracket ladder.

**This is testable without new data.** Stage 2 of the reconstruction maps placings to points
against published per-event points on the rankings page. When Stage 2 runs for 2023, the Surf
Ranch column either reconciles under Appendix B or it does not.

### 5.4 Abu Dhabi scoring basis

Recorded in `HANDOVER.md` §13 as *"surf press only, needs a WSL source"*. No press
source has been retained in the repo, so at present it is not even that. Treat as `null`.

### 5.5 Does a placing in a pool event mean what it means in a bracket?

Not yet asked anywhere. In a bracket, 5th means "lost in the Quarterfinals". In the 2023 pool
event, a surfer eliminated 3rd on a 12-man Night Round leaderboard has a *leaderboard rank*, not
a heat placing. Whether WSL maps that to a bracket-equivalent finishing position — and if so how —
is unknown. Bears directly on 5.3.

---

## 6. Status against the season files

| File | Field | Current | After this document |
|---|---|---|---|
| `2023.yaml` event 6 | `round_structure` | `null`, `BLOCKING: true` | still `null` — structure documented, not sourced to primary |
| `2025.yaml` event 2 | `round_structure` | `null`, `BLOCKING: true` | still `null` — nothing found |
| `era_a.yaml` | `pool_events.source` | `rulebook 2.02, 12.xx` | **wrong, correction proposed, not applied** |

Both `BLOCKING: true` flags stay. Both `todo` strings need one edit: they assert that
*"the rulebook delegates pool formats to the Commissioner's Office"*. §1 shows the delegation is
**Chapter 8**, and that the named office was the Office of Tours and Competition in 2023 and the
Commissioners Office in 2025. The "Commissioner's Office" phrasing came from Longboard rule
4.07(d), which does not govern CT events.

Both `todo` strings should also gain the Chapter 8 fourteen-day obligation, since it names a
document that is known to exist and is the thing to go and find.

---

## 7. Sources

| Source | Covers | Grade |
|---|---|---|
| `docs/sources/raw/nxtbets_2023_surf_ranch_format.md` (+ `.json` sidecar) | 2023 Surf Ranch structure and scoring | Secondary, known defect |
| `docs/format-spec/rulebooks/*.pdf` — six WSL rulebooks | Chapter 8 delegation and the 14-day obligation; the WS definition; Longboard 4.07(d) and QS/CS 2.08 as non-governing look-alikes | Primary |
| Taryn, 28 July 2026 | No official WSL wave-system ruling published since 2021 | Unretained assertion, corroborates the rulebook search |
| `scripts/generate_2018_surf_ranch_migration.py` + `data/surf_ranch_2018_raw.txt` | best-left + best-right heat totals, 2018 | **Not a source** — quarantined v1 data. Cited only as an arithmetic corroboration, §4.1 |
| — | 2025 Abu Dhabi structure | **None** |

### A loose end found while writing this

`scripts/generate_2018_surf_ranch_migration.py`, `scripts/reingest_2018_surf_ranch.ts` and
`data/surf_ranch_2018_raw.txt` are **untracked** and sit outside the v1 quarantine list in
`CLAUDE.md`. They are Era C, out of Era A scope, and built on v1 data. They should be either
quarantined explicitly or deleted — not left in the working tree unclassified, which is how the
v1 failure propagated. Not actioned here; flagged for Taryn.
