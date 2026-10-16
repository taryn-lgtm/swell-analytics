-- =====================================================================
-- 00000000000007_interference_wave_effects.sql
-- What an interference penalty did, to which rides
-- =====================================================================
--
-- Depends on: 00000000000001, 00000000000006
-- Target:     v2, ref tjwqskjsyluxepdbwjet
--
-- *** DRAFTED 8 AUGUST 2026. NOT APPLIED. ***
--
-- HELD DELIBERATELY. The only interference view held is a 2026 event
-- (Round 3 Heat 1, Punta Roca, 8 June 2026). Era A is 2022-2025, and this
-- project has already found several places where 2026 differs from Era A —
-- the points table among them. Applying a schema shape for Era A on the
-- evidence of a 2026 page is the "very likely" reasoning the rebuild
-- exists to remove.
--
-- APPLY ONCE ONE ERA A INTERFERENCE HEAT HAS BEEN SEEN and the rendering
-- confirmed. 2024 Bells or Margaret River are good candidates. If the
-- Era A layout differs, fix this file first — do not apply it and adapt.
--
-- WHY A CHILD TABLE. `interferences` as built records who, against whom,
-- which wave and what level. It cannot record what the penalty DID,
-- because rule 11.17 defines four levels with different effects and the
-- number of rides altered varies by level:
--
--   level 1  second highest scoring ride halved
--   level 2  second highest scoring ride scores zero
--   level 3  (rulebook 11.17)
--   disqualification
--
-- The Punta Roca view shows a level 2 altering TWO rides, each with its
-- own published explanation:
--
--   "1. Wave on which interference occurred is zeroed"   -> ride 4, 0.00
--   "2. Second counting wave is zeroed"                  -> ride 2, 0.00
--
-- One nullable column on the parent cannot hold that, and a fixed pair of
-- columns would be a guess about levels 1 and 3, which nobody has seen.
-- One row per altered ride is the shape the published data actually has.
--
-- THE MODELLING FACT THIS PROTECTS. O'Brien's counting pair stood at
-- 5.13 + 0.00 while a 2.50 and two 2.17s went unpromoted. The penalty
-- zeroes the second counter; it does not promote the next ride. Any code
-- recomputing a heat total as "best two surviving rides" disagrees with
-- WSL on every interference heat. waves.counted is read, never derived —
-- see the comment on that column.
--
-- =====================================================================

BEGIN;

CREATE TABLE interference_wave_effects (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interference_id bigint NOT NULL REFERENCES interferences(id) ON DELETE CASCADE,
  wave_id         bigint NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  effect          text NOT NULL,
  published_note  text,
  artefact_id     bigint REFERENCES artefacts(id),
  CONSTRAINT iwe_effect_check CHECK (effect IN (
    'interference_wave_zeroed',   -- the ride the interference occurred on
    'counting_wave_zeroed',       -- level 2: second counting ride to zero
    'counting_wave_halved',       -- level 1: second counting ride halved
    'other'                       -- seen but not yet classified. Needs a data_gaps row.
  )),
  CONSTRAINT iwe_one_effect_per_wave UNIQUE (interference_id, wave_id)
);

COMMENT ON TABLE interference_wave_effects IS
  'One row per ride an interference penalty altered. Interference is a full record, not a flag — and "full" has to include what the penalty did, or the record cannot explain why a published heat total does not equal the best two rides.';

COMMENT ON COLUMN interference_wave_effects.effect IS
  'Classified from WSL''s own footnote text, which is published verbatim beneath the ride table. "other" exists so an unrecognised footnote is recorded loudly rather than dropped or forced into the nearest category; a row carrying it needs a data_gaps entry naming the footnote.';

COMMENT ON COLUMN interference_wave_effects.published_note IS
  'WSL''s footnote verbatim, e.g. "Second counting wave is zeroed". Retained alongside the classification for the same reason as heat_entries.progression_text: a misclassification stays fixable without re-fetching.';

-- The parent's wave_id becomes ambiguous once effects are recorded
-- separately. Pin its meaning rather than leaving two plausible readings.
COMMENT ON COLUMN interferences.wave_id IS
  'The ride on which the interference OCCURRED. Not necessarily the only ride altered, and not necessarily altered at all under every penalty level. What the penalty did, and to which rides, is in interference_wave_effects.';

COMMENT ON COLUMN interferences.against_id IS
  'Nullable, and expected to be null often. The Heat Details view names the offender and the penalty level but not the surfer interfered with — Punta Roca 2026 shows a marker and "Interference Penalty 2" and nothing more. Null here means not published, and wants a data_gaps row rather than an inference from heat context.';

CREATE INDEX idx_iwe_interference ON interference_wave_effects (interference_id);
CREATE INDEX idx_iwe_wave         ON interference_wave_effects (wave_id);

ALTER TABLE interference_wave_effects ENABLE ROW LEVEL SECURITY;

-- Every altered ride must belong to the surfer who committed the
-- interference, and to the heat the interference was recorded in. A
-- penalty landing on someone else's ride is a mapping bug.
CREATE VIEW v_interference_effect_mismatches AS
SELECT
  iwe.id AS effect_id,
  i.id   AS interference_id,
  i.heat_id      AS interference_heat_id,
  he.heat_id     AS wave_heat_id,
  i.offender_id,
  he.surfer_id   AS wave_surfer_id
FROM interference_wave_effects iwe
JOIN interferences i  ON i.id = iwe.interference_id
JOIN waves w          ON w.id = iwe.wave_id
JOIN heat_entries he  ON he.id = w.heat_entry_id
WHERE he.heat_id   IS DISTINCT FROM i.heat_id
   OR he.surfer_id IS DISTINCT FROM i.offender_id;

COMMENT ON VIEW v_interference_effect_mismatches IS
  'Must be empty. Catches an effect attached to a ride in the wrong heat, or to a ride belonging to a surfer other than the offender.';

CREATE VIEW v_interference_zeroed_waves_disagree AS
SELECT
  iwe.id AS effect_id,
  iwe.effect,
  w.score
FROM interference_wave_effects iwe
JOIN waves w ON w.id = iwe.wave_id
WHERE iwe.effect IN ('interference_wave_zeroed', 'counting_wave_zeroed')
  AND w.score <> 0;

COMMENT ON VIEW v_interference_zeroed_waves_disagree IS
  'Must be empty. A ride recorded as zeroed by a penalty must carry a score of 0.00, because WSL publishes post-penalty values — docs/findings/2026-08-08_wave_level_availability_corrected.md §3.1. A row here means either the effect is misclassified or the published score is pre-penalty after all, and the second would overturn a finding.';

ALTER VIEW v_interference_effect_mismatches      SET (security_invoker = on);
ALTER VIEW v_interference_zeroed_waves_disagree  SET (security_invoker = on);

COMMIT;
