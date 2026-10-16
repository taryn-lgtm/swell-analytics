-- Independent expected figures for /events/[slug]. Written against the tables,
-- not through src/lib/queries/event.ts. One canonical line per rendered figure,
-- per section, per event; the page's HTML is reduced to the same lines and hashed.
with ev as (
  select e.*, e.slug || '-' || e.season_year as param from events e
),
rnd as (select * from rounds where name is not null),
ht as (
  select h.*, r.event_id, r.round_order, r.name as round_name, v.name as venue_name
  from heats h join rnd r on r.id = h.round_id left join venues v on v.id = h.venue_id
),
he as (
  select x.*, h.event_id, h.round_order, h.round_name, h.heat_number, h.venue_name,
         h.wave_height_published, h.wind_conditions, s.full_name
  from heat_entries x join ht h on h.id = x.heat_id join surfers s on s.id = x.surfer_id
),
surfed as (select event_id, surfer_id, count(*) n from he group by 1, 2),
fin as (select event_id, surfer_id, max(finished_position) fp from he where finished_position is not null group by 1, 2),
-- ---- header -----------------------------------------------------------
hdr as (
  select ev.id, concat_ws(E'\n',
    'rounds=' || (select count(*) from rnd where event_id = ev.id),
    'heats=' || (select count(*) from ht where event_id = ev.id),
    'surfed=' || (select count(*) from surfed where event_id = ev.id),
    'winner=' || coalesce(
      case when ev.kind = 'wsl_finals'
        then (select s.full_name from fin join surfers s on s.id = fin.surfer_id where fin.event_id = ev.id and fin.fp = 1)
        else (select s.full_name from event_entries ee join surfers s on s.id = ee.surfer_id where ee.event_id = ev.id and ee.event_placing = 1)
      end, 'Not published'),
    'venues=' || coalesce((select string_agg(venue_name || ' (' || n || ' ' || case when n = 1 then 'heat' else 'heats' end || ')', ', ' order by venue_name collate "C")
                           from (select venue_name, count(*) n from ht where event_id = ev.id and venue_name is not null group by 1) q), 'venue unknown'),
    case when ev.start_date is not null then 'dates=' ||
      case when ev.end_date is not null and ev.end_date <> ev.start_date
        then to_char(ev.start_date, 'FMDD Mon YYYY') || ' – ' || to_char(ev.end_date, 'FMDD Mon YYYY')
        else to_char(ev.start_date, 'FMDD Mon YYYY') end end,
    (select 'venue_unknown=' || count(*) from ht where event_id = ev.id and venue_id is null having count(*) > 0),
    (select 'listed=' || v.name from venues v where v.id = ev.venue_id)
  ) as txt from ev
),
-- ---- draw: the first named round's heats, names in codepoint order ----
draw as (
  select ev.id, string_agg(coalesce('Heat ' || lpad(he.heat_number::text, 2, '0'), 'Heat') || ':' || he.full_name, E'\n'
           order by he.heat_number, he.full_name collate "C") as txt
  from ev join he on he.event_id = ev.id
  where he.round_order = (select min(round_order) from rnd where event_id = ev.id)
  group by ev.id
),
-- ---- field ------------------------------------------------------------
fld_rows as (
  select ev.id as event_id, ev.kind, s.full_name,
    coalesce(sf.n, 0) as heats,
    ee.event_placing, ee.points, ee.participation, ee.status, ee.throwaway_published,
    fin.fp,
    case when ev.kind = 'wsl_finals' then fin.fp else coalesce(ee.event_placing, fin.fp) end as rk
  from ev
  join (select event_id, surfer_id from surfed union select event_id, surfer_id from event_entries) u on u.event_id = ev.id
  join surfers s on s.id = u.surfer_id
  left join surfed sf on sf.event_id = ev.id and sf.surfer_id = u.surfer_id
  left join event_entries ee on ee.event_id = ev.id and ee.surfer_id = u.surfer_id
  left join fin on fin.event_id = ev.id and fin.surfer_id = u.surfer_id
),
fld as (
  select event_id as id, string_agg(
    concat_ws('|',
      case when p is null then '—' else p || case when p % 100 between 11 and 13 then 'th' when p % 10 = 1 then 'st' when p % 10 = 2 then 'nd' when p % 10 = 3 then 'rd' else 'th' end end,
      full_name, heats,
      case when kind <> 'wsl_finals' then coalesce(to_char(points, 'FM999,999,999'), '—') end,
      case when kind <> 'wsl_finals' then case when throwaway_published then 'T' else '' end end,
      case when kind <> 'wsl_finals' then case
        when participation is null then 'no entry row'
        when participation = 'ct_surfer' then 'CT surfer'
        when participation = 'injury_replacement' then 'Injury replacement'
        when participation = 'event_wildcard' then 'Event wildcard'
        else participation end end,
      case when kind <> 'wsl_finals' then case
        when status is null then '—'
        when status = 'competed' then 'Competed'
        when status = 'did_not_contest' then 'Did not contest'
        when status = 'injured_withdrawal' then 'Injured withdrawal'
        when status = 'non_injury_withdrawal' then 'Non-injury withdrawal'
        else status end end
    ), E'\n' order by rk nulls last, full_name collate "C") as txt
  from (select *, case when kind = 'wsl_finals' then fp else event_placing end as p from fld_rows) q
  group by event_id
),
-- ---- heat list ----------------------------------------------------------
rides as (
  select heat_entry_id, string_agg(to_char(score, 'FM990.00'), ' + ' order by score desc) r
  from waves where counted and score is not null group by 1
),
hl as (
  select he.event_id as id, string_agg(concat_ws('|',
      he.round_name,
      coalesce('Heat ' || lpad(he.heat_number::text, 2, '0'), 'Heat'),
      coalesce(he.venue_name, 'venue unknown'),
      case when he.wave_height_published is not null or he.wind_conditions is not null
        then coalesce(he.wave_height_published, '—') || ' · ' || coalesce(he.wind_conditions, '—')
        else 'conditions not published' end,
      coalesce(he.position::text, '—'),
      he.full_name,
      coalesce(rides.r, '—'),
      coalesce(to_char(he.heat_total, 'FM990.00'), '—'),
      coalesce(he.progression_text, '')
    ), E'\n' order by he.round_order, he.heat_number, he.position nulls last, he.full_name collate "C") as txt
  from he left join rides on rides.heat_entry_id = he.id
  group by he.event_id
),
-- ---- Trim movement: first trim_before, last trim_after, per surfer -----
mv_rows as (
  select ev.id as event_id, t.surfer_id, count(*) n,
    (array_agg(t.trim_before order by t.seq))[1] tb,
    (array_agg(t.trim_after order by t.seq desc))[1] ta,
    (array_agg(t.prior_weight order by t.seq desc))[1] pw
  from ev join trim t on t.season_year = ev.season_year and t.event_number = ev.event_number
  group by 1, 2
),
mv as (
  select m.event_id as id, count(*) as n, string_agg(concat_ws('|',
      s.full_name, m.n,
      to_char(round(m.tb, 3), 'FM990.000'),
      to_char(round(m.ta, 3), 'FM990.000'),
      case when m.ta - m.tb > 0 then '+' when m.ta - m.tb < 0 then '−' else '±' end || to_char(round(abs(m.ta - m.tb), 3), 'FM990.000'),
      to_char(round(m.pw, 3), 'FM990.000')
    ), E'\n' order by round(m.ta - m.tb, 6) desc, s.full_name collate "C") as txt
  from mv_rows m join surfers s on s.id = m.surfer_id
  group by m.event_id
)
select ev.param,
  md5(hdr.txt) h_md5,
  md5(coalesce(draw.txt, '')) d_md5, (select count(*) from regexp_split_to_table(coalesce(draw.txt,''), E'\n')) d_n,
  md5(coalesce(fld.txt, '')) f_md5, (select count(*) from regexp_split_to_table(coalesce(fld.txt,''), E'\n')) f_n,
  md5(coalesce(hl.txt, '')) s_md5, (select count(*) from regexp_split_to_table(coalesce(hl.txt,''), E'\n')) s_n,
  md5('movers_n=' || coalesce(mv.n, 0) || E'\n' || coalesce(mv.txt, '')) m_md5, coalesce(mv.n, 0) m_n
from ev join hdr on hdr.id = ev.id
left join draw on draw.id = ev.id left join fld on fld.id = ev.id
left join hl on hl.id = ev.id left join mv on mv.id = ev.id
order by ev.season_year, ev.event_number;
