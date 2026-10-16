# Throwaway rule — derivation and verification

**Date:** 25 July 2026
**Status:** Hypothesis validated against nine independent cases across four seasons. Needs a rulebook citation to be considered closed.

---

## The rule

> Each surfer's season total drops **one** result. Only **pre-cut** events are eligible.
> The dropped result is the surfer's worst **pre-cut** result — which is not always their worst result overall.

---

## Why this was not obvious

The 2022–2025 rulebooks all contain Rule 1.09(c):

> "If there are seven (7) Regular Season CT Events prior to the Mid-Season Cut, then there will be one (1) Throwaway for the purposes of determining the top twenty-two (22) men."

Read alone, that clause says the throwaway is conditional on a 7-event pre-cut block and applies only to the mid-season cut. **The published rankings contradict this.** A drop is applied to season totals in every Era A season, including those with only five pre-cut events.

So either another provision governs the season-total throwaway, or 1.09(c) is a narrower restatement of a general rule stated elsewhere. **Locate that provision before writing the points engine.**

---

## Evidence

Published season totals do not equal the sum of published per-event points. Source: `worldsurfleague.com/athletes/tour/mct?year={year}`, captured 25 July 2026.

| Season | Surfer | Sum of events | Published total | Dropped | Worst overall | Worst pre-cut | Fits? |
|---|---|---|---|---|---|---|---|
| 2022 | Filipe Toledo | 58,010 | 54,690 | 3,320 | 1,330 (evt 10) | 3,320 | Yes |
| 2022 | Italo Ferreira | 41,790 | 40,460 | 1,330 | 1,330 | 1,330 | Yes |
| 2023 | Filipe Toledo | 59,630 | 58,300 | 1,330 | 1,330 | 1,330 | Yes |
| 2023 | Ethan Ewing | 49,410 | 48,080 | 1,330 | 265 (evt 10) | 1,330 | Yes |
| 2024 | John John Florence | 50,860 | 49,530 | 1,330 | 1,330 | 1,330 | Yes |
| 2024 | Italo Ferreira | 38,695 | 37,365 | 1,330 | 1,330 | 1,330 | Yes |
| 2024 | Griffin Colapinto | 49,920 | 46,600 | 3,320 | 1,330 (evt 6) | 3,320 | Yes |
| 2024 | Jack Robinson | 41,460 | 40,130 | 1,330 | 1,330 | 1,330 | Yes |
| 2025 | Yago Dora | 55,015 | 54,750 | 265 | 265 | 265 | Yes |

**Nine of nine.** The three cases where the dropped value is *not* the surfer's worst result — Toledo 2022, Ewing 2023, Colapinto 2024 — are precisely the cases where their worst result fell at a post-cut event and was therefore ineligible.

Cut positions used: after event 5 for 2022, 2023 and 2024; after event 7 for 2025.

---

## Full-field validation

The nine worked cases above were then tested programmatically against every row of every Era A rankings table.

Method: for each surfer, sum the published per-event points and compare the published season total against (a) no drop, (b) sum minus worst result overall, (c) sum minus worst **pre-cut** result.

| Season | Rows | Fits pre-cut rule | No drop applied | Contradicts rule | Not testable |
|---|---|---|---|---|---|
| 2022 | 37 | 19 | 0 | **0** | 18 |
| 2023 | 34 | 23 | 0 | **0** | 11 |
| 2024 | 34 | 32 | 1 | **0** | 1 |
| 2025 | 34 | 21 | 0 | **0** | 13 |
| **Total** | **139** | **95** | **1** | **0** | **43** |

**Ninety-five confirmations, zero contradictions.** No case anywhere in Era A is explained by "drop worst overall" but not by "drop worst pre-cut".

### The 43 untestable rows are a known gap

Those rows have fewer per-event values than the season has events — surfers who did not compete in every event, overwhelmingly those eliminated at the mid-season cut. Whether a throwaway applies to a surfer with only five results, leaving four counting, is **untested and unknown**. Resolve before the engine ships; these are roughly a third of the field.

### Empty cells are real and must survive scraping

Ramzi Boukhiam's 2024 row parsed to eight values against a nine-event season, and his published total exceeded the sum of what parsed. The missing value is an empty cell for an event he did not contest. Any scraper that silently drops empty cells will misalign every subsequent event column for that surfer. Cells must be read positionally, and absence recorded as absence rather than collapsed.

---

## The rulebook does not support this rule

A full read of Chapter 1 in the 2024 book found no CT provision authorising a season-total throwaway. What exists:

- **Rule 1.09(c)** — one throwaway, conditional on seven pre-cut events, scoped to determining the top 22 at the mid-season cut. Does not govern season totals, and its condition is not met in 2022, 2023 or 2024, all of which nonetheless show a drop.
- **The glossary definition** — "Throwaway means the Event where a Surfer earned the least points in that tour year." This has **no pre-cut restriction**, and it is contradicted by the data: Colapinto 2024, Toledo 2022 and Ewing 2023 all keep their worst result and drop a better one, because their worst fell after the cut.
- **Rule 4.06(a)** — an explicit counting-events provision, but for the Longboard Tour, not the CT.

**Conclusion: the rulebook is not sufficient as a source for the points engine.** The published rankings are the authority. The spec records the empirically derived rule, with the rulebook noted as inconsistent rather than silently reconciled.

---

## Open

1. **Untested:** whether a throwaway applies to surfers eliminated at the cut who hold fewer than a full set of results. Roughly a third of each field.
2. **Untested:** the single 2024 row where no drop was applied at all. Identify the surfer and the reason.
3. Confirm cut positions for 2022, 2023 and 2024 from a published source rather than by inference from the calendar.
4. Establish whether the same rule shape holds in Era B and Era C, where pre-2020 seasons are believed to drop two events.
5. Re-run this test as a standing audit check once ingest exists, rather than treating it as a one-off.

---

## Corrections this forces

**Handover §5.4 was right about pre-cut eligibility and wrong about the count.** It states "2022 onward: only pre-cut events eligible for throwaway" — correct. It carries "pre-2020: drop 2 events" forward as the general shape; in Era A there is exactly **one** drop.

**A naive "drop worst result" implementation is wrong** and will produce correct totals for most surfers and silently wrong totals for the minority whose worst result came after the cut. That failure mode — right for most rows, wrong for a few, no error raised — is exactly what v1 shipped.

---

## Consequences for verification

The rankings page is the reconciliation source the handover §8 gate requires. It publishes, per surfer per season:

- final rank
- WSL Finals placing
- points from every regular season event, as separate columns
- season total

This makes full-table reconciliation possible for every surfer, not just the top five, straight from a single page per season.

**It also confirms champion ≠ points leader directly.** In 2024, Griffin Colapinto finished with 46,600 points against Italo Ferreira's 37,365, yet ranked 3rd to Ferreira's 2nd, because the top five positions are reallocated by WSL Finals placing under Rule 1.05(e). Recording the champion as an explicit field is not defensive — it is required.

---

