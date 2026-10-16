// Generated from the v2 Supabase project `tjwqskjsyluxepdbwjet` on 1 September 2026,
// via the Supabase MCP connector's generate_typescript_types against the live schema.
//
// Everything below this header is generator output, byte for byte. Regenerating
// replaces it and DROPS this header — re-add it, or the file loses its provenance.
//
// The previous contents described the QUARANTINED v1 project (ref deliberately not
// written here — item 1's check greps src/ and the env for it) and are recoverable
// at `git show 549a394:src/lib/database.types.ts`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      artefacts: {
        Row: {
          content_length: number | null
          content_type: string | null
          fetched_at: string
          file_path: string
          http_status: number | null
          id: number
          notes: string | null
          retrieval: string
          sha256: string
          url: string | null
        }
        Insert: {
          content_length?: number | null
          content_type?: string | null
          fetched_at: string
          file_path: string
          http_status?: number | null
          id?: never
          notes?: string | null
          retrieval: string
          sha256: string
          url?: string | null
        }
        Update: {
          content_length?: number | null
          content_type?: string | null
          fetched_at?: string
          file_path?: string
          http_status?: number | null
          id?: never
          notes?: string | null
          retrieval?: string
          sha256?: string
          url?: string | null
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          iso_alpha3: string | null
          name: string
          notes: string | null
        }
        Insert: {
          code: string
          iso_alpha3?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          code?: string
          iso_alpha3?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      data_gaps: {
        Row: {
          closed_at: string | null
          field: string
          id: number
          opened_at: string
          reason: string
          scope: string
          scope_id: number | null
          season_year: number | null
          source_note: string | null
        }
        Insert: {
          closed_at?: string | null
          field: string
          id?: never
          opened_at?: string
          reason: string
          scope: string
          scope_id?: number | null
          season_year?: number | null
          source_note?: string | null
        }
        Update: {
          closed_at?: string | null
          field?: string
          id?: never
          opened_at?: string
          reason?: string
          scope?: string
          scope_id?: number | null
          season_year?: number | null
          source_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_gaps_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "data_gaps_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      datum: {
        Row: {
          actual_heat_total: number
          expected_score: number
          field_size: number | null
          heat_entry_id: number
          heat_id: number
          id: number
          model_run_id: number
          residual: number
          round_id: number
          surfer_id: number
          venue_id: number | null
        }
        Insert: {
          actual_heat_total: number
          expected_score: number
          field_size?: number | null
          heat_entry_id: number
          heat_id: number
          id?: number
          model_run_id: number
          residual: number
          round_id: number
          surfer_id: number
          venue_id?: number | null
        }
        Update: {
          actual_heat_total?: number
          expected_score?: number
          field_size?: number | null
          heat_entry_id?: number
          heat_id?: number
          id?: number
          model_run_id?: number
          residual?: number
          round_id?: number
          surfer_id?: number
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "heat_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_agreement"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_disagreements"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "datum_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "datum_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "datum_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "datum_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "datum_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "datum_model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "v_datum_coverage"
            referencedColumns: ["model_run_id"]
          },
          {
            foreignKeyName: "datum_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      datum_model_runs: {
        Row: {
          cells_file: string
          computed_on: string
          id: number
          ladder_monotone: boolean
          lambda: number
          n_entries: number
          n_events: number
          n_rounds: number
          r2_vs_intercept: number
          rmse_intercept_loeo: number
          rmse_intercept_loso: number
          rmse_loeo: number
          rmse_loso: number
          script: string
          spec: string
        }
        Insert: {
          cells_file: string
          computed_on: string
          id?: number
          ladder_monotone: boolean
          lambda: number
          n_entries: number
          n_events: number
          n_rounds: number
          r2_vs_intercept: number
          rmse_intercept_loeo: number
          rmse_intercept_loso: number
          rmse_loeo: number
          rmse_loso: number
          script: string
          spec: string
        }
        Update: {
          cells_file?: string
          computed_on?: string
          id?: number
          ladder_monotone?: boolean
          lambda?: number
          n_entries?: number
          n_events?: number
          n_rounds?: number
          r2_vs_intercept?: number
          rmse_intercept_loeo?: number
          rmse_intercept_loso?: number
          rmse_loeo?: number
          rmse_loso?: number
          script?: string
          spec?: string
        }
        Relationships: []
      }
      datum_round_effects: {
        Row: {
          expected_score: number
          id: number
          model_run_id: number
          n_entries: number
          on_ladder: boolean
          round_name: string
        }
        Insert: {
          expected_score: number
          id?: number
          model_run_id: number
          n_entries: number
          on_ladder: boolean
          round_name: string
        }
        Update: {
          expected_score?: number
          id?: number
          model_run_id?: number
          n_entries?: number
          on_ladder?: boolean
          round_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "datum_round_effects_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "datum_model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_round_effects_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "v_datum_coverage"
            referencedColumns: ["model_run_id"]
          },
        ]
      }
      eras: {
        Row: {
          champion_is_points_leader: boolean
          code: string
          first_season: number
          has_mid_season_cut: boolean
          has_wsl_finals: boolean
          last_season: number | null
          name: string
          notes: string | null
          throwaway_eligibility: string | null
          throwaway_form: string | null
        }
        Insert: {
          champion_is_points_leader: boolean
          code: string
          first_season: number
          has_mid_season_cut: boolean
          has_wsl_finals: boolean
          last_season?: number | null
          name: string
          notes?: string | null
          throwaway_eligibility?: string | null
          throwaway_form?: string | null
        }
        Update: {
          champion_is_points_leader?: boolean
          code?: string
          first_season?: number
          has_mid_season_cut?: boolean
          has_wsl_finals?: boolean
          last_season?: number | null
          name?: string
          notes?: string | null
          throwaway_eligibility?: string | null
          throwaway_form?: string | null
        }
        Relationships: []
      }
      event_entries: {
        Row: {
          artefact_id: number
          event_id: number
          event_placing: number | null
          id: number
          participation: string
          points: number | null
          points_status: string
          status: string
          status_note: string | null
          surfer_id: number
          throwaway_derived: boolean | null
          throwaway_published: boolean | null
        }
        Insert: {
          artefact_id: number
          event_id: number
          event_placing?: number | null
          id?: never
          participation: string
          points?: number | null
          points_status: string
          status?: string
          status_note?: string | null
          surfer_id: number
          throwaway_derived?: boolean | null
          throwaway_published?: boolean | null
        }
        Update: {
          artefact_id?: number
          event_id?: number
          event_placing?: number | null
          id?: never
          participation?: string
          points?: number | null
          points_status?: string
          status?: string
          status_note?: string | null
          surfer_id?: number
          throwaway_derived?: boolean | null
          throwaway_published?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          artefact_id: number
          awards_ranking_points: boolean
          end_date: string | null
          event_number: number
          field_size: number | null
          id: number
          kind: string
          name: string
          occurs_after_cut: boolean
          season_year: number
          slug: string
          start_date: string | null
          throwaway_eligible: boolean
          venue_artefact_id: number | null
          venue_id: number | null
          wsl_event_id: string | null
        }
        Insert: {
          artefact_id: number
          awards_ranking_points?: boolean
          end_date?: string | null
          event_number: number
          field_size?: number | null
          id?: never
          kind: string
          name: string
          occurs_after_cut: boolean
          season_year: number
          slug: string
          start_date?: string | null
          throwaway_eligible: boolean
          venue_artefact_id?: number | null
          venue_id?: number | null
          wsl_event_id?: string | null
        }
        Update: {
          artefact_id?: number
          awards_ranking_points?: boolean
          end_date?: string | null
          event_number?: number
          field_size?: number | null
          id?: never
          kind?: string
          name?: string
          occurs_after_cut?: boolean
          season_year?: number
          slug?: string
          start_date?: string | null
          throwaway_eligible?: boolean
          venue_artefact_id?: number | null
          venue_id?: number | null
          wsl_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_venue_artefact_id_fkey"
            columns: ["venue_artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      heat_entries: {
        Row: {
          advanced_to_round_id: number | null
          artefact_id: number
          finished_position: number | null
          heat_id: number
          heat_total: number | null
          id: number
          position: number | null
          progression_text: string | null
          surfer_id: number
        }
        Insert: {
          advanced_to_round_id?: number | null
          artefact_id: number
          finished_position?: number | null
          heat_id: number
          heat_total?: number | null
          id?: never
          position?: number | null
          progression_text?: string | null
          surfer_id: number
        }
        Update: {
          advanced_to_round_id?: number | null
          artefact_id?: number
          finished_position?: number | null
          heat_id?: number
          heat_total?: number | null
          id?: never
          position?: number | null
          progression_text?: string | null
          surfer_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "heat_entries_advanced_to_round_id_fkey"
            columns: ["advanced_to_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      heats: {
        Row: {
          artefact_id: number | null
          duration_minutes: number | null
          heat_number: number | null
          id: number
          published_avg_heat_score: number | null
          published_wave_count: number | null
          round_id: number
          sequence_in_round: number | null
          status: string
          venue_artefact_id: number | null
          venue_id: number | null
          wave_height_max_ft: number | null
          wave_height_min_ft: number | null
          wave_height_published: string | null
          wind_conditions: string | null
          wsl_heat_id: string | null
        }
        Insert: {
          artefact_id?: number | null
          duration_minutes?: number | null
          heat_number?: number | null
          id?: never
          published_avg_heat_score?: number | null
          published_wave_count?: number | null
          round_id: number
          sequence_in_round?: number | null
          status?: string
          venue_artefact_id?: number | null
          venue_id?: number | null
          wave_height_max_ft?: number | null
          wave_height_min_ft?: number | null
          wave_height_published?: string | null
          wind_conditions?: string | null
          wsl_heat_id?: string | null
        }
        Update: {
          artefact_id?: number | null
          duration_minutes?: number | null
          heat_number?: number | null
          id?: never
          published_avg_heat_score?: number | null
          published_wave_count?: number | null
          round_id?: number
          sequence_in_round?: number | null
          status?: string
          venue_artefact_id?: number | null
          venue_id?: number | null
          wave_height_max_ft?: number | null
          wave_height_min_ft?: number | null
          wave_height_published?: string | null
          wind_conditions?: string | null
          wsl_heat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heats_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heats_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heats_venue_artefact_id_fkey"
            columns: ["venue_artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      interference_wave_effects: {
        Row: {
          artefact_id: number | null
          effect: string
          id: number
          interference_id: number
          published_note: string | null
          wave_id: number
        }
        Insert: {
          artefact_id?: number | null
          effect: string
          id?: never
          interference_id: number
          published_note?: string | null
          wave_id: number
        }
        Update: {
          artefact_id?: number | null
          effect?: string
          id?: never
          interference_id?: number
          published_note?: string | null
          wave_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "interference_wave_effects_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interference_wave_effects_interference_id_fkey"
            columns: ["interference_id"]
            isOneToOne: false
            referencedRelation: "interferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interference_wave_effects_interference_id_fkey"
            columns: ["interference_id"]
            isOneToOne: false
            referencedRelation: "v_interference_effect_mismatches"
            referencedColumns: ["interference_id"]
          },
          {
            foreignKeyName: "interference_wave_effects_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "waves"
            referencedColumns: ["id"]
          },
        ]
      }
      interferences: {
        Row: {
          against_id: number | null
          artefact_id: number | null
          heat_id: number
          id: number
          offender_id: number
          penalty_level: string
          wave_id: number | null
        }
        Insert: {
          against_id?: number | null
          artefact_id?: number | null
          heat_id: number
          id?: never
          offender_id: number
          penalty_level: string
          wave_id?: number | null
        }
        Update: {
          against_id?: number | null
          artefact_id?: number | null
          heat_id?: number
          id?: never
          offender_id?: number
          penalty_level?: string
          wave_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interferences_against_id_fkey"
            columns: ["against_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_offender_id_fkey"
            columns: ["offender_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "waves"
            referencedColumns: ["id"]
          },
        ]
      }
      points_band_occupancy: {
        Row: {
          artefact_id: number | null
          band_width: number
          era_code: string
          field_size: number
          position: number
          source_note: string | null
        }
        Insert: {
          artefact_id?: number | null
          band_width: number
          era_code: string
          field_size: number
          position: number
          source_note?: string | null
        }
        Update: {
          artefact_id?: number | null
          band_width?: number
          era_code?: string
          field_size?: number
          position?: number
          source_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_band_occupancy_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_band_occupancy_era_code_position_fkey"
            columns: ["era_code", "position"]
            isOneToOne: false
            referencedRelation: "points_bands"
            referencedColumns: ["era_code", "position"]
          },
        ]
      }
      points_bands: {
        Row: {
          artefact_id: number
          era_code: string
          points: number
          position: number
          source_note: string | null
        }
        Insert: {
          artefact_id: number
          era_code: string
          points: number
          position: number
          source_note?: string | null
        }
        Update: {
          artefact_id?: number
          era_code?: string
          points?: number
          position?: number
          source_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "points_bands_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_bands_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
        ]
      }
      round_template_outcomes: {
        Row: {
          advances_to_round_order: number | null
          era_code: string
          field_size: number
          finishes_at_position: number | null
          heat_placing: number
          notes: string | null
          round_order: number
          source_grade: string
        }
        Insert: {
          advances_to_round_order?: number | null
          era_code: string
          field_size: number
          finishes_at_position?: number | null
          heat_placing: number
          notes?: string | null
          round_order: number
          source_grade: string
        }
        Update: {
          advances_to_round_order?: number | null
          era_code?: string
          field_size?: number
          finishes_at_position?: number | null
          heat_placing?: number
          notes?: string | null
          round_order?: number
          source_grade?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_advances_to_ro_fkey"
            columns: ["era_code", "field_size", "advances_to_round_order"]
            isOneToOne: false
            referencedRelation: "round_templates"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_advances_to_ro_fkey"
            columns: ["era_code", "field_size", "advances_to_round_order"]
            isOneToOne: false
            referencedRelation: "v_round_template_flow_disagreements"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_advances_to_ro_fkey"
            columns: ["era_code", "field_size", "advances_to_round_order"]
            isOneToOne: false
            referencedRelation: "v_round_template_outcome_gaps"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_round_order_fkey"
            columns: ["era_code", "field_size", "round_order"]
            isOneToOne: false
            referencedRelation: "round_templates"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_round_order_fkey"
            columns: ["era_code", "field_size", "round_order"]
            isOneToOne: false
            referencedRelation: "v_round_template_flow_disagreements"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
          {
            foreignKeyName: "round_template_outcomes_era_code_field_size_round_order_fkey"
            columns: ["era_code", "field_size", "round_order"]
            isOneToOne: false
            referencedRelation: "v_round_template_outcome_gaps"
            referencedColumns: ["era_code", "field_size", "round_order"]
          },
        ]
      }
      round_templates: {
        Row: {
          artefact_id: number | null
          best_of: number
          entry_rule: string | null
          era_code: string
          field_size: number
          heat_count: number | null
          heat_size: number | null
          name: string
          notes: string | null
          outcome_basis: string
          round_order: number
          source: string
          source_grade: string
        }
        Insert: {
          artefact_id?: number | null
          best_of?: number
          entry_rule?: string | null
          era_code: string
          field_size: number
          heat_count?: number | null
          heat_size?: number | null
          name: string
          notes?: string | null
          outcome_basis: string
          round_order: number
          source: string
          source_grade: string
        }
        Update: {
          artefact_id?: number | null
          best_of?: number
          entry_rule?: string | null
          era_code?: string
          field_size?: number
          heat_count?: number | null
          heat_size?: number | null
          name?: string
          notes?: string | null
          outcome_basis?: string
          round_order?: number
          source?: string
          source_grade?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_templates_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
        ]
      }
      rounds: {
        Row: {
          artefact_id: number | null
          counting_rides: number | null
          event_id: number
          id: number
          is_leaderboard: boolean
          max_heat_score: number | null
          name: string | null
          round_order: number
          scoring_basis: string | null
          wsl_code: string | null
        }
        Insert: {
          artefact_id?: number | null
          counting_rides?: number | null
          event_id: number
          id?: never
          is_leaderboard?: boolean
          max_heat_score?: number | null
          name?: string | null
          round_order: number
          scoring_basis?: string | null
          wsl_code?: string | null
        }
        Update: {
          artefact_id?: number | null
          counting_rides?: number | null
          event_id?: number
          id?: never
          is_leaderboard?: boolean
          max_heat_score?: number | null
          name?: string | null
          round_order?: number
          scoring_basis?: string | null
          wsl_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      season_rankings: {
        Row: {
          artefact_id: number
          points_total: number
          rank: number
          season_year: number
          surfer_id: number
        }
        Insert: {
          artefact_id: number
          points_total: number
          rank: number
          season_year: number
          surfer_id: number
        }
        Update: {
          artefact_id?: number
          points_total?: number
          rank?: number
          season_year?: number
          surfer_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_rankings_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rankings_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "season_rankings_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "season_rankings_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          champion_artefact_id: number | null
          cut_after_event: number | null
          cut_positions: number | null
          cut_source_artefact_id: number | null
          cut_source_grade: string | null
          cut_source_note: string | null
          era_code: string
          pre_cut_event_count: number
          world_champion_surfer_id: number | null
          year: number
        }
        Insert: {
          champion_artefact_id?: number | null
          cut_after_event?: number | null
          cut_positions?: number | null
          cut_source_artefact_id?: number | null
          cut_source_grade?: string | null
          cut_source_note?: string | null
          era_code: string
          pre_cut_event_count: number
          world_champion_surfer_id?: number | null
          year: number
        }
        Update: {
          champion_artefact_id?: number | null
          cut_after_event?: number | null
          cut_positions?: number | null
          cut_source_artefact_id?: number | null
          cut_source_grade?: string | null
          cut_source_note?: string | null
          era_code?: string
          pre_cut_event_count?: number
          world_champion_surfer_id?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_champion_artefact_id_fkey"
            columns: ["champion_artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_cut_source_artefact_id_fkey"
            columns: ["cut_source_artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "seasons_world_champion_surfer_id_fkey"
            columns: ["world_champion_surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      surfers: {
        Row: {
          artefact_id: number | null
          country_code: string | null
          full_name: string
          id: number
          slug: string
          wsl_athlete_id: string | null
        }
        Insert: {
          artefact_id?: number | null
          country_code?: string | null
          full_name: string
          id?: never
          slug: string
          wsl_athlete_id?: string | null
        }
        Update: {
          artefact_id?: number | null
          country_code?: string | null
          full_name?: string
          id?: never
          slug?: string
          wsl_athlete_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surfers_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surfers_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      trim: {
        Row: {
          datum_id: number
          event_number: number
          heat_entry_id: number
          heat_id: number
          heat_number: number
          id: number
          model_run_id: number
          prior_weight: number
          residual: number
          round_order: number
          season_year: number
          seq: number
          surfer_id: number
          trim_after: number
          trim_before: number
        }
        Insert: {
          datum_id: number
          event_number: number
          heat_entry_id: number
          heat_id: number
          heat_number: number
          id?: number
          model_run_id: number
          prior_weight: number
          residual: number
          round_order: number
          season_year: number
          seq: number
          surfer_id: number
          trim_after: number
          trim_before: number
        }
        Update: {
          datum_id?: number
          event_number?: number
          heat_entry_id?: number
          heat_id?: number
          heat_number?: number
          id?: number
          model_run_id?: number
          prior_weight?: number
          residual?: number
          round_order?: number
          season_year?: number
          seq?: number
          surfer_id?: number
          trim_after?: number
          trim_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "trim_datum_id_fkey"
            columns: ["datum_id"]
            isOneToOne: false
            referencedRelation: "datum"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_datum_id_fkey"
            columns: ["datum_id"]
            isOneToOne: false
            referencedRelation: "v_datum_effect_disagreements"
            referencedColumns: ["datum_id"]
          },
          {
            foreignKeyName: "trim_datum_id_fkey"
            columns: ["datum_id"]
            isOneToOne: false
            referencedRelation: "v_datum_provenance_gaps"
            referencedColumns: ["datum_id"]
          },
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "heat_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_agreement"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_disagreements"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "trim_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "trim_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "trim_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "trim_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "trim_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "trim_model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "v_trim_coverage"
            referencedColumns: ["model_run_id"]
          },
          {
            foreignKeyName: "trim_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      trim_model_runs: {
        Row: {
          alpha: number
          computed_on: string
          datum_model_run_id: number
          half_life_heats: number
          id: number
          n_entries: number
          n_scored: number
          n_surfers: number
          ordering: string
          paired_t_vs_shrunk: number
          prior: number
          rmse_predict_zero: number
          rmse_shrunk_flat_mean: number
          rmse_walkforward: number
          selection_file: string
          spec: string
        }
        Insert: {
          alpha: number
          computed_on: string
          datum_model_run_id: number
          half_life_heats: number
          id?: number
          n_entries: number
          n_scored: number
          n_surfers: number
          ordering: string
          paired_t_vs_shrunk: number
          prior: number
          rmse_predict_zero: number
          rmse_shrunk_flat_mean: number
          rmse_walkforward: number
          selection_file: string
          spec: string
        }
        Update: {
          alpha?: number
          computed_on?: string
          datum_model_run_id?: number
          half_life_heats?: number
          id?: number
          n_entries?: number
          n_scored?: number
          n_surfers?: number
          ordering?: string
          paired_t_vs_shrunk?: number
          prior?: number
          rmse_predict_zero?: number
          rmse_shrunk_flat_mean?: number
          rmse_walkforward?: number
          selection_file?: string
          spec?: string
        }
        Relationships: [
          {
            foreignKeyName: "trim_model_runs_datum_model_run_id_fkey"
            columns: ["datum_model_run_id"]
            isOneToOne: false
            referencedRelation: "datum_model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_model_runs_datum_model_run_id_fkey"
            columns: ["datum_model_run_id"]
            isOneToOne: false
            referencedRelation: "v_datum_coverage"
            referencedColumns: ["model_run_id"]
          },
        ]
      }
      venues: {
        Row: {
          artefact_id: number | null
          country_code: string | null
          id: number
          kind: string
          name: string
          slug: string
        }
        Insert: {
          artefact_id?: number | null
          country_code?: string | null
          id?: never
          kind: string
          name: string
          slug: string
        }
        Update: {
          artefact_id?: number | null
          country_code?: string | null
          id?: never
          kind?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      waves: {
        Row: {
          artefact_id: number
          counted: boolean
          heat_entry_id: number
          id: number
          orientation: string | null
          score: number
          wave_order: number
        }
        Insert: {
          artefact_id: number
          counted: boolean
          heat_entry_id: number
          id?: never
          orientation?: string | null
          score: number
          wave_order: number
        }
        Update: {
          artefact_id?: number
          counted?: boolean
          heat_entry_id?: number
          id?: never
          orientation?: string | null
          score?: number
          wave_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "waves_artefact_id_fkey"
            columns: ["artefact_id"]
            isOneToOne: false
            referencedRelation: "artefacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "heat_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_agreement"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "waves_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_disagreements"
            referencedColumns: ["heat_entry_id"]
          },
        ]
      }
    }
    Views: {
      v_avg_heat_score_disagreements: {
        Row: {
          heat_id: number | null
          mean_of_heat_totals: number | null
          published_avg_heat_score: number | null
        }
        Relationships: []
      }
      v_band_occupancy_check: {
        Row: {
          covered: number | null
          era_code: string | null
          field_size: number | null
          shortfall: number | null
        }
        Relationships: []
      }
      v_datum_coverage: {
        Row: {
          claimed_entries: number | null
          eligible_entries: number | null
          model_run_id: number | null
          stored_rows: number | null
        }
        Insert: {
          claimed_entries?: number | null
          eligible_entries?: never
          model_run_id?: number | null
          stored_rows?: never
        }
        Update: {
          claimed_entries?: number | null
          eligible_entries?: never
          model_run_id?: number | null
          stored_rows?: never
        }
        Relationships: []
      }
      v_datum_effect_disagreements: {
        Row: {
          datum_id: number | null
          on_datum_row: number | null
          on_effect_row: number | null
          round_name: string | null
        }
        Relationships: []
      }
      v_datum_provenance_gaps: {
        Row: {
          datum_id: number | null
          heat_entry_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "heat_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_agreement"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "datum_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_disagreements"
            referencedColumns: ["heat_entry_id"]
          },
        ]
      }
      v_heat_total_agreement: {
        Row: {
          counting_rides: number | null
          counting_wave_count: number | null
          counting_wave_sum: number | null
          heat_entry_id: number | null
          heat_id: number | null
          heat_total: number | null
          scoring_basis: string | null
          surfer_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_heat_total_disagreements: {
        Row: {
          counting_rides: number | null
          counting_wave_count: number | null
          counting_wave_sum: number | null
          heat_entry_id: number | null
          heat_id: number | null
          heat_total: number | null
          scoring_basis: string | null
          surfer_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_heat_venue_gaps: {
        Row: {
          event_number: number | null
          heat_id: number | null
          season_year: number | null
          wsl_heat_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_interference_effect_mismatches: {
        Row: {
          effect_id: number | null
          interference_heat_id: number | null
          interference_id: number | null
          offender_id: number | null
          wave_heat_id: number | null
          wave_surfer_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["wave_heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["wave_heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["wave_heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["wave_heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_heat_id_fkey"
            columns: ["wave_heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "heat_entries_surfer_id_fkey"
            columns: ["wave_surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["interference_heat_id"]
            isOneToOne: false
            referencedRelation: "heats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["interference_heat_id"]
            isOneToOne: false
            referencedRelation: "v_avg_heat_score_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["interference_heat_id"]
            isOneToOne: false
            referencedRelation: "v_heat_venue_gaps"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["interference_heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_agreement"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_heat_id_fkey"
            columns: ["interference_heat_id"]
            isOneToOne: false
            referencedRelation: "v_wave_count_disagreements"
            referencedColumns: ["heat_id"]
          },
          {
            foreignKeyName: "interferences_offender_id_fkey"
            columns: ["offender_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_interference_zeroed_waves_disagree: {
        Row: {
          effect: string | null
          effect_id: number | null
          score: number | null
        }
        Relationships: []
      }
      v_points_disagreements: {
        Row: {
          event_entry_id: number | null
          event_number: number | null
          event_placing: number | null
          field_size: number | null
          participation: string | null
          points_derived: number | null
          points_published: number | null
          points_status: string | null
          season_year: number | null
          surfer_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_points_reconciliation: {
        Row: {
          event_entry_id: number | null
          event_number: number | null
          event_placing: number | null
          field_size: number | null
          participation: string | null
          points_derived: number | null
          points_published: number | null
          points_status: string | null
          season_year: number | null
          surfer_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_pre_cut_count_check: {
        Row: {
          counted: number | null
          declared: number | null
          year: number | null
        }
        Relationships: []
      }
      v_provenance_coverage: {
        Row: {
          rows_null: number | null
          rows_total: number | null
          table_name: string | null
        }
        Relationships: []
      }
      v_provenance_gaps: {
        Row: {
          row_id: number | null
          table_name: string | null
        }
        Relationships: []
      }
      v_provenance_uncovered: {
        Row: {
          table_name: unknown
        }
        Relationships: []
      }
      v_round_name_differences: {
        Row: {
          event_number: number | null
          field_size: number | null
          kind: string | null
          published_name: string | null
          round_order: number | null
          rulebook_name: string | null
          season_year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_round_structure_deviations: {
        Row: {
          deviation: string | null
          event_name: string | null
          event_number: number | null
          expected_round: string | null
          field_size: number | null
          observed_round: string | null
          round_order: number | null
          season_year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_round_template_band_disagreements: {
        Row: {
          era_code: string | null
          field_size: number | null
          from_points_table: number | null
          from_round_structure: number | null
          position: number | null
        }
        Relationships: []
      }
      v_round_template_cohorts: {
        Row: {
          era_code: string | null
          field_size: number | null
          position: number | null
          surfers_finishing: number | null
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
        ]
      }
      v_round_template_flow_disagreements: {
        Row: {
          arriving: number | null
          capacity: number | null
          era_code: string | null
          field_size: number | null
          name: string | null
          round_order: number | null
        }
        Insert: {
          arriving?: never
          capacity?: never
          era_code?: string | null
          field_size?: number | null
          name?: string | null
          round_order?: number | null
        }
        Update: {
          arriving?: never
          capacity?: never
          era_code?: string | null
          field_size?: number | null
          name?: string | null
          round_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
        ]
      }
      v_round_template_outcome_gaps: {
        Row: {
          era_code: string | null
          field_size: number | null
          heat_size: number | null
          name: string | null
          outcomes_defined: number | null
          round_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_era_code_fkey"
            columns: ["era_code"]
            isOneToOne: false
            referencedRelation: "eras"
            referencedColumns: ["code"]
          },
        ]
      }
      v_throwaway_disagreements: {
        Row: {
          event_entry_id: number | null
          event_number: number | null
          season_year: number | null
          surfer_id: number | null
          throwaway_derived: boolean | null
          throwaway_published: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "events_season_year_fkey"
            columns: ["season_year"]
            isOneToOne: false
            referencedRelation: "v_pre_cut_count_check"
            referencedColumns: ["year"]
          },
        ]
      }
      v_trim_coverage: {
        Row: {
          claimed_entries: number | null
          datum_rows: number | null
          entries_with_no_total: number | null
          model_run_id: number | null
          stored_rows: number | null
        }
        Insert: {
          claimed_entries?: number | null
          datum_rows?: never
          entries_with_no_total?: never
          model_run_id?: number | null
          stored_rows?: never
        }
        Update: {
          claimed_entries?: number | null
          datum_rows?: never
          entries_with_no_total?: never
          model_run_id?: number | null
          stored_rows?: never
        }
        Relationships: []
      }
      v_trim_current: {
        Row: {
          country_code: string | null
          full_name: string | null
          last_season: number | null
          model_run_id: number | null
          n_heats: number | null
          prior_weight: number | null
          slug: string | null
          surfer_id: number | null
          trim: number | null
        }
        Relationships: [
          {
            foreignKeyName: "surfers_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "trim_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "trim_model_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_model_run_id_fkey"
            columns: ["model_run_id"]
            isOneToOne: false
            referencedRelation: "v_trim_coverage"
            referencedColumns: ["model_run_id"]
          },
          {
            foreignKeyName: "trim_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trim_provenance_gaps: {
        Row: {
          heat_entry_id: number | null
          trim_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "heat_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_agreement"
            referencedColumns: ["heat_entry_id"]
          },
          {
            foreignKeyName: "trim_heat_entry_id_fkey"
            columns: ["heat_entry_id"]
            isOneToOne: false
            referencedRelation: "v_heat_total_disagreements"
            referencedColumns: ["heat_entry_id"]
          },
        ]
      }
      v_trim_recursion_breaks: {
        Row: {
          previous_trim_after: number | null
          seq: number | null
          surfer_id: number | null
          trim_before: number | null
          trim_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trim_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trim_step_disagreements: {
        Row: {
          recomputed: number | null
          seq: number | null
          surfer_id: number | null
          trim_after: number | null
          trim_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trim_surfer_id_fkey"
            columns: ["surfer_id"]
            isOneToOne: false
            referencedRelation: "surfers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_wave_count_agreement: {
        Row: {
          heat_id: number | null
          published_wave_count: number | null
          rides_loaded: number | null
        }
        Relationships: []
      }
      v_wave_count_disagreements: {
        Row: {
          heat_id: number | null
          published_wave_count: number | null
          rides_loaded: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
