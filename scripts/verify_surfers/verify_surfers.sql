-- Independent expected values for /surfers/[slug], 1 October 2026.
--
-- Written against the tables directly, NOT through src/lib/queries/surfer.ts
-- and not through v_trim_current: "current Trim" is re-derived from `trim`
-- (last seq per surfer), and every residual is heat_total - datum.expected_score
-- rather than the stored trim.residual. Read-only. Run against v2
-- (tjwqskjsyluxepdbwjet) only.
--
-- Emits expected.tsv as one text value: per (slug, section), the number of
-- canonical lines and the first 12 hex digits of the md5 of those lines
-- joined by "\n". verify_surfers.py reduces the rendered
-- HTML to the same lines and compares. Rounding is half away from zero
-- (Postgres round() on numeric) everywhere -- decision 68.
with
he as (
  select he.id as heid, he.surfer_id, he.position, he.heat_total, he.progression_text,
         h.id as heat_id, h.heat_number, h.wind_conditions, h.wave_height_published,
         h.wave_height_min_ft, v.name as venue,
         r.round_order, r.name as round_name, r.counting_rides,
         e.season_year, e.event_number, e.name as event_name, e.kind,
         d.expected_score,
         t.seq, t.trim_before, t.trim_after, t.prior_weight, t.model_run_id,
         case when t.id is not null and he.heat_total is not null and d.expected_score is not null
              then he.heat_total - d.expected_score end as resid,
         row_number() over (partition by he.surfer_id
           order by e.season_year, e.event_number, r.round_order, coalesce(h.heat_number, 0)) as rn
  from heat_entries he
  join heats h on h.id = he.heat_id
  join rounds r on r.id = h.round_id
  join events e on e.id = r.event_id
  left join venues v on v.id = h.venue_id
  left join datum d on d.heat_entry_id = he.id
  left join trim t on t.heat_entry_id = he.id
),
rides as (
  select w.heat_entry_id as heid,
         count(*) as k,
         string_agg(round(w.score, 2)::text, ' + ' order by w.score desc) as pair
  from waves w where w.counted and w.score is not null
  group by w.heat_entry_id
),
pts as (  -- the timeline's population: heats with a model row and a residual
  select he.*, row_number() over (partition by surfer_id order by rn) as i,
         count(*) over (partition by surfer_id) as npts
  from he where trim_after is not null and resid is not null
),
cur as (  -- current Trim, re-derived from `trim`, not read from v_trim_current
  select distinct on (surfer_id) surfer_id, trim_after as trim, prior_weight,
         count(*) over (partition by surfer_id) as n
  from trim order by surfer_id, seq desc
),
below as (select count(*) filter (where n < 16) as nb, count(*) as nr from cur),
run as (select * from trim_model_runs where id = (select max(model_run_id) from trim)),
db as (
  select count(*) filter (where wind_conditions is not null) as cond,
         count(*) as heats,
         count(*) filter (where venue_id is not null) as venue
  from heats
),
agg as (
  select s.id as surfer_id, s.slug, s.full_name,
         count(he.heid) as nheats,
         count(he.heat_total) as nrated,
         count(*) filter (where he.position = 1) as won,
         count(distinct (he.season_year, he.event_number)) as nevents,
         round(avg(he.heat_total), 2) as mean_total,
         max(he.heat_total) as best_total,
         count(he.trim_after) as ntrim,
         count(he.wind_conditions) as ncond,
         count(he.venue) as nvenue,
         string_agg(distinct he.season_year::text, ' and ') as seasons
  from surfers s left join he on he.surfer_id = s.id
  group by s.id, s.slug, s.full_name
),
ord as (select n, case when n % 100 between 11 and 13 then n || 'th'
                       when n % 10 = 1 then n || 'st' when n % 10 = 2 then n || 'nd'
                       when n % 10 = 3 then n || 'rd' else n || 'th' end as o
        from generate_series(1, 40) n),
lines as (
  -------------------------------------------------------------- header
  select a.slug, 'header' as section, 1 as k, 'name=' || a.full_name as line from agg a
  union all select a.slug, 'header', 2, 'seasons=' || coalesce('CT ' || a.seasons, '') from agg a
  union all select a.slug, 'header', 3, 'titles=' || coalesce((select string_agg(year::text, ',' order by year)
      from seasons where world_champion_surfer_id = a.surfer_id), '') from agg a
  union all select a.slug, 'header', 4, 'Trim=' || coalesce(round(c.trim, 3)::text, '—') || '|pts per heat'
      from agg a left join cur c using (surfer_id)
  union all select a.slug, 'header', 5, 'Rated heats=' || coalesce(c.n::text, '—') || '|'
      || case when c.n < 16 then 'below 16' else 'at or above 16' end
      from agg a left join cur c using (surfer_id)
  union all select a.slug, 'header', 6, 'Prior weight=' || coalesce(round(c.prior_weight, 3)::text, '—') || '|'
      || coalesce(round(c.prior_weight * 100)::int || '% of the rating', '')
      from agg a left join cur c using (surfer_id)
  union all select a.slug, 'header', 7, 'Heats surfed=' || a.nheats || '|' || a.nevents
      || case when a.nevents = 1 then ' event' else ' events' end from agg a
  union all select a.slug, 'header', 8, 'Heats won=' || a.won || '|'
      || case when a.nheats > 0 then 'of ' || a.nheats else '' end from agg a
  union all select a.slug, 'header', 9, 'Mean heat total=' || coalesce(a.mean_total::text, '—') || '|over ' || a.nrated from agg a
  union all select a.slug, 'header', 10, 'Best heat=' || coalesce(round(a.best_total, 2)::text, '—') || '|'
      || coalesce((select event_name from he where he.surfer_id = a.surfer_id and he.heat_total = a.best_total
                   order by rn limit 1), '') from agg a
  union all select a.slug, 'header', 11, 'below=' || c.n || ',16,'
      || coalesce(round(c.prior_weight * 100)::int || '%,', '') || b.nb || ',' || b.nr
      from agg a join cur c using (surfer_id) cross join below b where c.n < 16
  union all select a.slug, 'header', 12, 'logtitle=' || a.nheats || ' heats across ' || a.nevents
      || case when a.nevents = 1 then ' event' else ' events' end from agg a where a.nheats > 0
  -------------------------------------------------------------- heat log
  union all
  select s.slug, 'log', he.rn::int, concat_ws('|',
      coalesce(he.seq::text, '—'),
      he.season_year::text,
      he.event_name,
      case when he.kind = 'wsl_finals' then 'F' else '' end,
      he.round_name || coalesce(' · heat ' || he.heat_number, '') || coalesce(' · ' || he.venue, ''),
      coalesce((select o from ord where n = he.position), '—'),
      coalesce(round(he.heat_total, 2)::text, '—'),
      coalesce(rd.pair || case when he.counting_rides is not null and rd.k <> he.counting_rides
                               then ' (' || rd.k || ' of ' || he.counting_rides || ')' else '' end, '—'),
      case when he.trim_after is not null and he.resid is not null
           then case when round(he.resid, 2) >= 0 then '+' else '' end || round(he.resid, 2)::text
           else '—' end,
      case when he.trim_after is not null and he.resid is not null
           then 'exp ' || coalesce(round(he.expected_score, 2)::text, '—') else '' end,
      coalesce(round(he.trim_after, 3)::text, '—'),
      case when he.trim_after is not null then coalesce(round(he.prior_weight, 3)::text, '—') else '' end,
      case when he.wind_conditions is not null or he.wave_height_published is not null
           then regexp_replace(btrim(coalesce(he.wave_height_published, '—') || coalesce(' · ' || he.wind_conditions, '')), '\s+', ' ', 'g')
           else 'not published' end,
      coalesce(regexp_replace(btrim(he.progression_text), '\s+', ' ', 'g'), '—'))
  from he join surfers s on s.id = he.surfer_id left join rides rd on rd.heid = he.heid
  -------------------------------------------------------------- timeline
  union all
  select s.slug, 'timeline', 1, 'aria=Trim after each of ' || p.npts || ' heats for ' || s.full_name
      || ', from ' || round(p.trim_after, 3)::text || ' to '
      || (select round(trim_after, 3)::text from pts q where q.surfer_id = p.surfer_id and q.i = q.npts)
      || ', with the deviation from Datum for each heat below'
  from pts p join surfers s on s.id = p.surfer_id where p.i = 1
  union all
  select s.slug, 'timeline', 2, 'band=' || coalesce((
      select case when max(i) = 1 then 'first heat' else 'first ' || max(i) || ' heats' end
             || ': prior is 50% or more of the rating'
      from pts q where q.surfer_id = s.id and q.prior_weight >= 0.5 having count(*) > 0), '')
  from surfers s where exists (select 1 from pts where surfer_id = s.id)
  union all
  select s.slug, 'timeline', 2 + p.i::int,
      'pt=Heat ' || p.i || ' — ' || p.season_year || ' ' || p.event_name || ' · ' || p.round_name
      || coalesce(' heat ' || p.heat_number, '')
      || ' / Scored ' || coalesce(round(p.heat_total, 2)::text, '—') || ' against an expected '
      || coalesce(round(p.expected_score, 2)::text, '—')
      || ' (' || case when round(p.resid, 2) >= 0 then '+' else '' end || round(p.resid, 2)::text || ')'
      || ' / Trim ' || coalesce(round(p.trim_before, 3)::text, '—') || ' → ' || round(p.trim_after, 3)::text
      || ' · prior weight ' || coalesce(round(p.prior_weight, 3)::text, '—')
      || coalesce(' / ' || (select o from ord where n = p.position) || ' in the heat', '')
  from pts p join surfers s on s.id = p.surfer_id
  union all
  select s.slug, 'timeline', 100000,
    'extremes=' || case when x.bmax = x.bmin
      then 'The heat — one rated heat, so there is no best and worst to separate: '
           || case when round(x.bmax, 2) >= 0 then '+' else '' end || round(x.bmax, 2)::text || ' at ' || x.blab || '.'
      else 'Extremes — best ' || case when round(x.bmax, 2) >= 0 then '+' else '' end || round(x.bmax, 2)::text
           || ' at ' || x.blab || '; worst ' || case when round(x.bmin, 2) >= 0 then '+' else '' end
           || round(x.bmin, 2)::text || ' at ' || x.wlab || '.' end
    || ' Axis to ±' || greatest(4, ceil(x.amax))::int || ', the exact maximum rounded outward.'
  from surfers s
  join lateral (
    select max(resid) as bmax, min(resid) as bmin, max(abs(resid)) as amax,
      (select season_year || ' ' || event_name || ' · ' || round_name || coalesce(' heat ' || heat_number, '')
         from pts q where q.surfer_id = s.id order by resid desc, i limit 1) as blab,
      (select season_year || ' ' || event_name || ' · ' || round_name || coalesce(' heat ' || heat_number, '')
         from pts q where q.surfer_id = s.id order by resid asc, i limit 1) as wlab
    from pts where surfer_id = s.id having count(*) > 0
  ) x on true
  -------------------------------------------------------------- condition splits
  union all
  select slug, 'splits', grp * 1000 + row_number() over (partition by slug, grp order by sk1, sk2, sk3)::int,
         concat_ws('|', title, label,
           rated || case when rated <> heats then ' of ' || heats else '' end,
           coalesce(mean::text, '—'), coalesce(best::text, '—'), sv)
  from (
    select s.slug, 1 as grp, 'By published wave height' as title, he.wave_height_published as label,
           count(*) as heats, count(he.heat_total) as rated,
           round(avg(he.heat_total), 2) as mean, round(max(he.heat_total), 2) as best,
           coalesce(case when round(avg(he.resid) filter (where he.trim_after is not null), 2) >= 0 then '+' else '' end
                    || round(avg(he.resid) filter (where he.trim_after is not null), 2)::text, '—') as sv,
           coalesce((array_agg(he.wave_height_min_ft order by he.rn))[1], 0) as sk1,
           0 as sk2, lower(he.wave_height_published) as sk3
    from he join surfers s on s.id = he.surfer_id
    where he.wave_height_published is not null
    group by s.slug, he.wave_height_published
    union all
    select s.slug, 2, 'By published wind', he.wind_conditions,
           count(*), count(he.heat_total),
           round(avg(he.heat_total), 2), round(max(he.heat_total), 2),
           coalesce(case when round(avg(he.resid) filter (where he.trim_after is not null), 2) >= 0 then '+' else '' end
                    || round(avg(he.resid) filter (where he.trim_after is not null), 2)::text, '—'),
           0, -count(*), lower(he.wind_conditions)
    from he join surfers s on s.id = he.surfer_id
    where he.wind_conditions is not null
    group by s.slug, he.wind_conditions
  ) g
  union all
  select a.slug, 'splits', 1000, 'By published wave height|none' from agg a
    where a.nheats > 0 and not exists (select 1 from he where he.surfer_id = a.surfer_id and he.wave_height_published is not null)
  union all
  select a.slug, 'splits', 2000, 'By published wind|none' from agg a
    where a.nheats > 0 and not exists (select 1 from he where he.surfer_id = a.surfer_id and he.wind_conditions is not null)
  union all
  select a.slug, 'splits', 9000, 'coverage=' || a.ncond || ',' || a.nheats from agg a where a.nheats > 0
  -------------------------------------------------------------- provenance
  union all
  select a.slug, 'prov', 1, 'p=' || concat_ws(',', a.ntrim, a.nheats,
      case when a.nheats - a.ntrim > 0 then (a.nheats - a.ntrim)::text end,
      r.spec, trim_scale(r.half_life_heats)::text, trim_scale(r.prior)::text, r.computed_on::text,
      r.n_entries, r.n_surfers, trim_scale(r.rmse_walkforward)::text, trim_scale(r.rmse_shrunk_flat_mean)::text,
      trim_scale(r.paired_t_vs_shrunk)::text, trim_scale(r.rmse_predict_zero)::text)
  from agg a cross join run r where a.nheats > 0
  union all
  select a.slug, 'prov', 2, 'p=' || concat_ws(',',
      case when a.nheats - a.ntrim > 0 then (a.nheats - a.ntrim)::text end, a.nvenue, a.nheats)
  from agg a where a.nheats > 0
  union all
  select a.slug, 'prov', 3, 'p=' || concat_ws(',', d.cond, d.heats, d.venue, a.ncond, a.nheats)
  from agg a cross join db d where a.nheats > 0
)
select string_agg(slug || E'\t' || section || E'\t' || n || E'\t' || left(md5, 12), E'\n' order by slug, section) as expected_tsv
from (
  select s.slug, sec.section,
         count(l.line) as n,
         md5(coalesce(string_agg(l.line, E'\n' order by l.k), '')) as md5
  from surfers s
  cross join (values ('header'), ('log'), ('timeline'), ('splits'), ('prov')) sec(section)
  left join lines l on l.slug = s.slug and l.section = sec.section
  group by s.slug, sec.section
) x;
