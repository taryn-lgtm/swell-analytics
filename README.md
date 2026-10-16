# Swell Analytics

An independent analytics site for the World Surf League men's Championship Tour, built from published heat results.

**Live site:** https://wsl-analytics.vercel.app

It covers two complete seasons, 2024 and 2025 (results up to 4 September 2025): 22 events, 800 heats, 1,852 heat entries and 10,379 scored rides across 73 surfers. It is not affiliated with or endorsed by the World Surf League. The results data belongs to the WSL.

## What it shows

- **Rankings:** each season as WSL published it, with each surfer's dropped result left out, and the WSL Finals order that decides the title.
- **Surfer pages:** the heat-by-heat record, scores against the round's typical score, and splits by wave height and wind.
- **Event pages:** the draw, every heat, and how each surfer's Trim moved at that event.
- **Compare:** two surfers side by side, with every figure showing the number of heats behind it.
- **Trim:** the rating method, and what it cannot tell you.

## Two ideas the site is built on

**Datum** is the score a typical Championship Tour surfer posts in a given round. Scores rise through an event, from about 10.7 in an Opening Round heat to about 14.5 in a Final. A raw average therefore flatters surfers who reach late rounds, so every heat score here is also shown against Datum. Fitting and validation are in `scripts/compute_datum.py`, using leave-one-event-out and leave-one-season-out tests.

**Trim** is a surfer's recent scoring against Datum, weighted so a heat from 15 heats ago counts half as much as the latest one. It describes form. It does **not** reliably predict the next heat. In a walk-forward test over 1,770 heats, its error (RMSE 2.910) is statistically indistinguishable from a flat average of the same residuals (2.913, paired t = 0.54). The site says so.

## How the data was built

1. **Collect.** TypeScript collectors (`scripts/collect_*.ts`) fetch WSL's server-rendered results pages under their own research user agent. Collection is started by hand, resumes where it stopped, and never runs on a schedule.
2. **Retain before parsing.** Every page is saved to disk with a sidecar recording its URL, fetch time, SHA-256, status and size, before any parser runs (`scripts/lib/retain.ts`). Re-parses read the saved file and never re-fetch.
3. **Parse into SQL seeds.** Parsers (`scripts/lib/parse_*.ts`, `scripts/ingest_*.ts`) write reviewable SQL files rather than writing to the database. Each seed is applied by hand.
4. **Reconcile.** `scripts/reconstruct_season.ts` rebuilds WSL's published final rankings from the event results, including the dropped-result rule. Both seasons match exactly, 35 of 35 rows each, with no manual correction.
5. **Record gaps instead of filling them.** A value that was not published stays `null` and gets a row explaining why (329 recorded gaps). Every stored row traces back to a retained page.

This repository holds the code, schema, checks and method. **It does not include the retained WSL pages, the SQL seeds built from them, or the WSL rulebooks**, because those are WSL's material. As a result, the collectors and parser tests need a local copy of the retained pages to run.

## Checks

- `supabase/checks/` holds audit queries that must return zero rows, and negative tests for the schema.
- `scripts/verify_surfers/`, `scripts/verify_events/` and `scripts/verify_compare/` compare figures on the rendered pages against independent SQL. Each includes a deliberately wrong control that must fail.
- `scripts/mobile_audit.cjs` checks every page at phone and tablet widths.

## Stack

PostgreSQL on Supabase, with row-level security and public read-only policies. TypeScript and Python for the pipeline. Next.js, React and Tailwind for the site, which is prerendered and deployed on Vercel. The site makes no database writes.

`docs/format-spec/` is the competition-format specification the schema was built against. It covers cut rules, points bands, the dropped-result rule and wave-pool formats, each sourced to a published page or a rulebook clause.

## Running it

```bash
npm ci
# .env.local needs NEXT_PUBLIC_SUPABASE_URL_V2 and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_V2
npm run build && npm start
```

Built by Taryn Hawtrey-Collier.
