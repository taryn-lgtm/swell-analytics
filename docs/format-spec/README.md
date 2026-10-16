# Format specification — how to read this directory

**This directory is the source of truth for tour format.** It outranks `CLAUDE.md`, the
rulebooks, `HANDOVER.md`, and any recollection of a previous session. If any of those disagree
with the YAML, the YAML is right and the other document is stale — fix the other document.

Covers the men's Championship Tour, Era A (2022–2025). Eras B and C are not started.

---

## Precedence, highest first

1. **`seasons/*.yaml`** — the machine-readable facts. Anything expressible as a fact lives here.
2. **`POOL_EVENTS.md`** — wave-pool event structures, which YAML cannot yet carry cleanly.
3. **Published WSL rankings** — the authority the YAML is reconciled against.
4. **`rulebooks/*.pdf`** — an *input* to reconcile, not an authority. See "The rulebooks are not
   the authority" below.

## What each file is

| File | What it holds |
|---|---|
| `seasons/era_a.yaml` | Rules shared across all four Era A seasons, verified identical in all four rulebooks. Inherited via `inherits: era_a` |
| `seasons/{2022,2023,2024,2025}.yaml` | Season-specific facts only — calendar, event IDs, cut position, champion. Everything shared is inherited, so four copies cannot drift apart |
| `seasons/PATCH_era_a_2026-07-26.md` | **Applied**, commit `c953fed`. Retained as the rationale record for why five blocks changed. Do not apply again |
| `POOL_EVENTS.md` | The two Era A wave-pool events. Partially sourced — read its §5 before treating anything in it as settled |
| `THROWAWAY_DERIVATION.md` | How the throwaway rule was derived. **Its 2024 row counts are superseded** by `docs/findings/2026-07-25_reconstruction_2024.md` |
| `rulebooks/` | Published WSL rulebook PDFs: 2020, 2022, 2023, 2024, 2025, 2026. **2015–2019 are missing entirely** |

`era_a.yaml` lives in `seasons/`, alongside the season files. There is no `shared/` directory
and there never has been — any reference to `shared/era_a.yaml` anywhere in this repo is stale.

A prose companion to this spec is owed. The previous one, `FORMAT_SPEC.md`, was archived on
28 July 2026 — it predated `era_a.yaml` and its gate wording contradicted the current
milestone. Until a replacement exists, the YAML plus `POOL_EVENTS.md` are the specification.

## Rules for editing the YAML

1. **Every fact carries a `source`.** A fact with `source: null` is not verified and cannot be
   signed off, no matter how confidently it reconciles.
2. **Never write a plausible value.** Write `null` and a `todo`.
3. **A clean reconciliation is not a source.** It proves behaviour is consistent with a value.
   It does not supply a published citation for it. Do not let a passing test launder an
   unsourced fact.
4. **Do not edit the spec to make a test pass.** If the spec looks wrong, say so and let Taryn
   decide. A failing gate has already diagnosed one real spec defect — that is the gate working.
5. **State evidence strength honestly.** Where a rule rests on two rows, say two rows.

## The rulebooks are not the authority

They are an input to be reconciled against published results, and on at least one rule the two
disagree outright.

Rule 1.09(c) authorises a throwaway only under conditions not met in 2022, 2023 or 2024 — and
all three seasons apply a drop regardless. The rulebook glossary defines Throwaway with no
pre-cut restriction, which the published rankings contradict. No CT provision authorising the
season-total throwaway has been located at all.

**Where they conflict, the published rankings win and the conflict gets recorded**, not
smoothed over. `era_a.yaml` carries the disagreement explicitly in `throwaway.rulebook_conflict`.

There is also a provenance caveat on rulebook citations generally: the 2024 book held in
`rulebooks/` is not the edition that was in force during the 2024 season. See
`docs/findings/2026-07-28_cut_positions.md` §4.

## Known open items

Carried into M1 as known gaps rather than gates. Full list in `docs/CURRENT_MILESTONE.md`.

- QF/SF/Final `outcomes` are marked `closing_rounds_source: ASSUMED` in both round structures.
  They were stated so placings can be mapped to points at all. Confirm before sign-off.
- Cut positions are sourced to rulebook 1.09(c) for 2022, 2023 and 2025; 2024 remains
  `source: null`. **Those diffs are proposed, not applied.**
- The counting-events throwaway form is tested on 2024 only. 2022, 2023 and 2025 hold 42
  further discriminating rows.
- 2025 Abu Dhabi pool structure is `source: null`; 2023 Surf Ranch rests on a graded secondary
  source.
- Wave orientation for pool events (best-left + best-right) has no data behind it.
- Whether pool events use the standard Appendix B points table is unverified.
