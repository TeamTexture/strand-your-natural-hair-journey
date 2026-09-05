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
      account_erasure_runs: {
        Row: {
          cap: number
          details: Json
          dry_run: boolean
          eligible_count: number
          error: string | null
          id: string
          processed_count: number
          ran_at: string
          user_ids: string[]
        }
        Insert: {
          cap: number
          details?: Json
          dry_run?: boolean
          eligible_count?: number
          error?: string | null
          id?: string
          processed_count?: number
          ran_at?: string
          user_ids?: string[]
        }
        Update: {
          cap?: number
          details?: Json
          dry_run?: boolean
          eligible_count?: number
          error?: string | null
          id?: string
          processed_count?: number
          ran_at?: string
          user_ids?: string[]
        }
        Relationships: []
      }
      ad_consent_log: {
        Row: {
          changed_at: string
          consent_given: boolean
          id: string
          source: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          consent_given: boolean
          id?: string
          source?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          consent_given?: boolean
          id?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ad_events: {
        Row: {
          brand_product_id: string | null
          created_at: string
          event_type: string
          id: string
          match_reason: Json | null
          occurred_at: string
          offer_id: string | null
          session_id: string | null
          slot: string
          unit: string
          user_id: string | null
          was_matched: boolean | null
        }
        Insert: {
          brand_product_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          match_reason?: Json | null
          occurred_at?: string
          offer_id?: string | null
          session_id?: string | null
          slot?: string
          unit?: string
          user_id?: string | null
          was_matched?: boolean | null
        }
        Update: {
          brand_product_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          match_reason?: Json | null
          occurred_at?: string
          offer_id?: string | null
          session_id?: string | null
          slot?: string
          unit?: string
          user_id?: string | null
          was_matched?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_brand_product_id_fkey"
            columns: ["brand_product_id"]
            isOneToOne: false
            referencedRelation: "brand_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_offer_audience: {
        Row: {
          match_reason: string[]
          offer_id: string
          resolved_at: string
          user_id: string
        }
        Insert: {
          match_reason?: string[]
          offer_id: string
          resolved_at?: string
          user_id: string
        }
        Update: {
          match_reason?: string[]
          offer_id?: string
          resolved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_offer_audience_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_offer_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_offer_dismissals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_stats_daily: {
        Row: {
          code_copies: number
          expands: number
          impressions: number
          link_clicks: number
          matched_impressions: number
          matched_link_clicks: number
          offer_id: string
          raw_views: number
          rolled_up_at: string
          slot: string
          stat_date: string
          wishlist_adds: number
        }
        Insert: {
          code_copies?: number
          expands?: number
          impressions?: number
          link_clicks?: number
          matched_impressions?: number
          matched_link_clicks?: number
          offer_id: string
          raw_views?: number
          rolled_up_at?: string
          slot: string
          stat_date: string
          wishlist_adds?: number
        }
        Update: {
          code_copies?: number
          expands?: number
          impressions?: number
          link_clicks?: number
          matched_impressions?: number
          matched_link_clicks?: number
          offer_id?: string
          raw_views?: number
          rolled_up_at?: string
          slot?: string
          stat_date?: string
          wishlist_adds?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_stats_daily_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_targeting_attributes: {
        Row: {
          attribute_key: string
          attribute_label: string
          created_at: string
          label: string
          sort_order: number
          value_code: string
        }
        Insert: {
          attribute_key: string
          attribute_label: string
          created_at?: string
          label: string
          sort_order?: number
          value_code: string
        }
        Update: {
          attribute_key?: string
          attribute_label?: string
          created_at?: string
          label?: string
          sort_order?: number
          value_code?: string
        }
        Relationships: []
      }
      admin_account_deletion_log: {
        Row: {
          action: string
          created_at: string
          erase_on: string | null
          id: string
          performed_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          erase_on?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          erase_on?: string | null
          id?: string
          performed_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_broadcasts: {
        Row: {
          admin_user_id: string
          audience: string
          body: string
          created_at: string
          id: string
          image_path: string | null
          recipient_count: number
          voice_path: string | null
          voice_transcript: string | null
        }
        Insert: {
          admin_user_id: string
          audience: string
          body: string
          created_at?: string
          id?: string
          image_path?: string | null
          recipient_count?: number
          voice_path?: string | null
          voice_transcript?: string | null
        }
        Update: {
          admin_user_id?: string
          audience?: string
          body?: string
          created_at?: string
          id?: string
          image_path?: string | null
          recipient_count?: number
          voice_path?: string | null
          voice_transcript?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          read_by: string | null
          title: string
          type: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          read_by?: string | null
          title: string
          type: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          read_by?: string | null
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      ai_backfill_state: {
        Row: {
          job: string
          last_run_at: string | null
          lease_until: string | null
          note: string | null
          pause_reason: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          job: string
          last_run_at?: string | null
          lease_until?: string | null
          note?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          job?: string
          last_run_at?: string | null
          lease_until?: string | null
          note?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ai_call_log: {
        Row: {
          attempt_number: number | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          created_at: string
          duration_ms: number | null
          error_text: string | null
          function_name: string
          generation_id: string | null
          http_status: number | null
          id: string
          impersonated_by: string | null
          input_tokens: number | null
          is_impersonated: boolean
          max_attempts: number | null
          model: string
          model_called: boolean
          outcome: string
          output_tokens: number | null
          provider: string
          rejection_rule: string | null
          retry_reason: string | null
          stage: number
          surface: string | null
          user_id: string | null
        }
        Insert: {
          attempt_number?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error_text?: string | null
          function_name: string
          generation_id?: string | null
          http_status?: number | null
          id?: string
          impersonated_by?: string | null
          input_tokens?: number | null
          is_impersonated?: boolean
          max_attempts?: number | null
          model: string
          model_called?: boolean
          outcome?: string
          output_tokens?: number | null
          provider: string
          rejection_rule?: string | null
          retry_reason?: string | null
          stage?: number
          surface?: string | null
          user_id?: string | null
        }
        Update: {
          attempt_number?: number | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error_text?: string | null
          function_name?: string
          generation_id?: string | null
          http_status?: number | null
          id?: string
          impersonated_by?: string | null
          input_tokens?: number | null
          is_impersonated?: boolean
          max_attempts?: number | null
          model?: string
          model_called?: boolean
          outcome?: string
          output_tokens?: number | null
          provider?: string
          rejection_rule?: string | null
          retry_reason?: string | null
          stage?: number
          surface?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_citation_violations: {
        Row: {
          cleaned_length: number | null
          created_at: string
          function_name: string
          id: string
          original_length: number | null
          stripped_text: string
        }
        Insert: {
          cleaned_length?: number | null
          created_at?: string
          function_name: string
          id?: string
          original_length?: number | null
          stripped_text: string
        }
        Update: {
          cleaned_length?: number | null
          created_at?: string
          function_name?: string
          id?: string
          original_length?: number | null
          stripped_text?: string
        }
        Relationships: []
      }
      ai_content_rejections: {
        Row: {
          action: string
          attempt: number | null
          check_name: string
          created_at: string
          field: string
          function_name: string
          id: string
          phrase: string | null
          rule: string | null
          subject: string | null
          surface: string | null
          user_id: string | null
        }
        Insert: {
          action?: string
          attempt?: number | null
          check_name: string
          created_at?: string
          field: string
          function_name: string
          id?: string
          phrase?: string | null
          rule?: string | null
          subject?: string | null
          surface?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          attempt?: number | null
          check_name?: string
          created_at?: string
          field?: string
          function_name?: string
          id?: string
          phrase?: string | null
          rule?: string | null
          subject?: string | null
          surface?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_fidelity_rejections: {
        Row: {
          attempt: number
          chapters_in_context: number[] | null
          claim: string
          created_at: string
          field_path: string | null
          function_name: string
          id: string
          reason: string
          regenerated: boolean
          rule_id: string | null
          surface: string | null
        }
        Insert: {
          attempt?: number
          chapters_in_context?: number[] | null
          claim: string
          created_at?: string
          field_path?: string | null
          function_name: string
          id?: string
          reason: string
          regenerated?: boolean
          rule_id?: string | null
          surface?: string | null
        }
        Update: {
          attempt?: number
          chapters_in_context?: number[] | null
          claim?: string
          created_at?: string
          field_path?: string | null
          function_name?: string
          id?: string
          reason?: string
          regenerated?: boolean
          rule_id?: string | null
          surface?: string | null
        }
        Relationships: []
      }
      ai_model_rates: {
        Row: {
          cache_read_usd_per_mtok: number | null
          cache_write_usd_per_mtok: number | null
          input_usd_per_mtok: number | null
          model: string
          output_usd_per_mtok: number | null
          provider: string
          source: string | null
          updated_at: string
        }
        Insert: {
          cache_read_usd_per_mtok?: number | null
          cache_write_usd_per_mtok?: number | null
          input_usd_per_mtok?: number | null
          model: string
          output_usd_per_mtok?: number | null
          provider: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          cache_read_usd_per_mtok?: number | null
          cache_write_usd_per_mtok?: number | null
          input_usd_per_mtok?: number | null
          model?: string
          output_usd_per_mtok?: number | null
          provider?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_summaries: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          payload: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_dismissals: {
        Row: {
          alert_key: string
          dismissed_at: string
          id: string
          trigger_signature: string
          user_id: string
        }
        Insert: {
          alert_key: string
          dismissed_at?: string
          id?: string
          trigger_signature: string
          user_id: string
        }
        Update: {
          alert_key?: string
          dismissed_at?: string
          id?: string
          trigger_signature?: string
          user_id?: string
        }
        Relationships: []
      }
      analysis_score_debug: {
        Row: {
          brand: string | null
          created_at: string
          decrypt_status: string | null
          function_name: string
          generation_id: string | null
          health_tier_mode: string | null
          id: string
          profile_fields: Json
          score_breakdown: Json
          subject: string | null
          tier_included: string[]
          tier_withheld: string[]
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          decrypt_status?: string | null
          function_name: string
          generation_id?: string | null
          health_tier_mode?: string | null
          id?: string
          profile_fields?: Json
          score_breakdown?: Json
          subject?: string | null
          tier_included?: string[]
          tier_withheld?: string[]
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          decrypt_status?: string | null
          function_name?: string
          generation_id?: string | null
          health_tier_mode?: string | null
          id?: string
          profile_fields?: Json
          score_breakdown?: Json
          subject?: string | null
          tier_included?: string[]
          tier_withheld?: string[]
          user_id?: string
        }
        Relationships: []
      }
      appointment_photos: {
        Row: {
          appointment_id: string
          caption: string | null
          created_at: string
          id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          caption?: string | null
          created_at?: string
          id?: string
          storage_path: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          clinic_name: string | null
          created_at: string
          created_by: string | null
          follow_up_date: string | null
          follow_up_needed: boolean
          follow_up_time: string | null
          id: string
          linked_pro_user_id: string | null
          location_format: string | null
          notes: string | null
          outcome_audio_path: string | null
          outcome_notes: string | null
          professional_name: string
          professional_type: string | null
          reason: string | null
          reminder_sent_at: string | null
          service: string | null
          status: string
          treatment_plan_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_name?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          follow_up_needed?: boolean
          follow_up_time?: string | null
          id?: string
          linked_pro_user_id?: string | null
          location_format?: string | null
          notes?: string | null
          outcome_audio_path?: string | null
          outcome_notes?: string | null
          professional_name: string
          professional_type?: string | null
          reason?: string | null
          reminder_sent_at?: string | null
          service?: string | null
          status?: string
          treatment_plan_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          clinic_name?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          follow_up_needed?: boolean
          follow_up_time?: string | null
          id?: string
          linked_pro_user_id?: string | null
          location_format?: string | null
          notes?: string | null
          outcome_audio_path?: string | null
          outcome_notes?: string | null
          professional_name?: string
          professional_type?: string | null
          reason?: string | null
          reminder_sent_at?: string | null
          service?: string | null
          status?: string
          treatment_plan_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      author_clarifications: {
        Row: {
          applies_to: string[]
          created_at: string
          id: string
          is_active: boolean
          position: string
          sort_order: number
          topic: string
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          position: string
          sort_order?: number
          topic: string
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          position?: string
          sort_order?: number
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      blood_panels: {
        Row: {
          created_at: string
          id: string
          lab_name: string | null
          label: string | null
          notes: string | null
          panel_date: string
          scheduled_at: string | null
          status: string
          test_type: string | null
          thumbnail_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_name?: string | null
          label?: string | null
          notes?: string | null
          panel_date?: string
          scheduled_at?: string | null
          status?: string
          test_type?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_name?: string | null
          label?: string | null
          notes?: string | null
          panel_date?: string
          scheduled_at?: string | null
          status?: string
          test_type?: string | null
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blood_results: {
        Row: {
          category: string | null
          id: string
          marker: string
          panel_id: string | null
          status: string | null
          unit: string | null
          unit_enc: string | null
          updated_at: string
          user_id: string
          value: number | null
          value_enc: string | null
        }
        Insert: {
          category?: string | null
          id?: string
          marker: string
          panel_id?: string | null
          status?: string | null
          unit?: string | null
          unit_enc?: string | null
          updated_at?: string
          user_id: string
          value?: number | null
          value_enc?: string | null
        }
        Update: {
          category?: string | null
          id?: string
          marker?: string
          panel_id?: string | null
          status?: string | null
          unit?: string | null
          unit_enc?: string | null
          updated_at?: string
          user_id?: string
          value?: number | null
          value_enc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blood_results_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "blood_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_blood_panels: {
        Row: {
          affiliate_url: string | null
          brand_user_id: string | null
          created_at: string
          currency: string
          discount_code: string | null
          discount_details: string | null
          id: string
          is_active: boolean
          is_at_home_kit: boolean
          markers_covered: string[]
          panel_name: string | null
          price_from: number | null
          purchase_url: string | null
          regions_served: string[]
          sort_order: number
          updated_at: string
          vendor_logo_path: string | null
          vendor_name: string | null
          vendor_website: string | null
        }
        Insert: {
          affiliate_url?: string | null
          brand_user_id?: string | null
          created_at?: string
          currency?: string
          discount_code?: string | null
          discount_details?: string | null
          id?: string
          is_active?: boolean
          is_at_home_kit?: boolean
          markers_covered?: string[]
          panel_name?: string | null
          price_from?: number | null
          purchase_url?: string | null
          regions_served?: string[]
          sort_order?: number
          updated_at?: string
          vendor_logo_path?: string | null
          vendor_name?: string | null
          vendor_website?: string | null
        }
        Update: {
          affiliate_url?: string | null
          brand_user_id?: string | null
          created_at?: string
          currency?: string
          discount_code?: string | null
          discount_details?: string | null
          id?: string
          is_active?: boolean
          is_at_home_kit?: boolean
          markers_covered?: string[]
          panel_name?: string | null
          price_from?: number | null
          purchase_url?: string | null
          regions_served?: string[]
          sort_order?: number
          updated_at?: string
          vendor_logo_path?: string | null
          vendor_name?: string | null
          vendor_website?: string | null
        }
        Relationships: []
      }
      brand_offer_admin_overrides: {
        Row: {
          admin_user_id: string
          created_at: string
          ends_on: string | null
          fee_charged_pence: number
          id: string
          offer_id: string
          placement_changed: boolean
          placements_added: number
          placements_removed: number
          slots: string[] | null
          starts_on: string | null
          targeting_changed: boolean
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          ends_on?: string | null
          fee_charged_pence?: number
          id?: string
          offer_id: string
          placement_changed?: boolean
          placements_added?: number
          placements_removed?: number
          slots?: string[] | null
          starts_on?: string | null
          targeting_changed?: boolean
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          ends_on?: string | null
          fee_charged_pence?: number
          id?: string
          offer_id?: string
          placement_changed?: boolean
          placements_added?: number
          placements_removed?: number
          slots?: string[] | null
          starts_on?: string | null
          targeting_changed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_admin_overrides_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_interest: {
        Row: {
          created_at: string
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_interest_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_placements: {
        Row: {
          created_at: string
          daily_rate_pence: number
          id: string
          offer_id: string
          placement_date: string
          slot: Database["public"]["Enums"]["brand_placement_slot"]
        }
        Insert: {
          created_at?: string
          daily_rate_pence: number
          id?: string
          offer_id: string
          placement_date: string
          slot: Database["public"]["Enums"]["brand_placement_slot"]
        }
        Update: {
          created_at?: string
          daily_rate_pence?: number
          id?: string
          offer_id?: string
          placement_date?: string
          slot?: Database["public"]["Enums"]["brand_placement_slot"]
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_placements_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_products: {
        Row: {
          brand_product_id: string
          created_at: string
          id: string
          offer_id: string
          position: number
        }
        Insert: {
          brand_product_id: string
          created_at?: string
          id?: string
          offer_id: string
          position?: number
        }
        Update: {
          brand_product_id?: string
          created_at?: string
          id?: string
          offer_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_products_brand_product_id_fkey"
            columns: ["brand_product_id"]
            isOneToOne: false
            referencedRelation: "brand_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_offer_products_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_revisions: {
        Row: {
          body_copy: string | null
          brand_user_id: string
          checkout_started_at: string | null
          created_at: string
          discount_code: string | null
          external_url: string | null
          headline: string | null
          hero_image_path: string | null
          id: string
          offer_id: string
          paid_at: string | null
          payment_required: boolean
          payment_waived: boolean
          products: Json
          reach_after: number | null
          reach_before: number | null
          rejection_reason: string | null
          remaining_days: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          submitted_at: string
          targeting: Json | null
          targeting_changed: boolean
          tier_after: string | null
          tier_before: string | null
          updated_at: string
          uplift_pence: number
        }
        Insert: {
          body_copy?: string | null
          brand_user_id: string
          checkout_started_at?: string | null
          created_at?: string
          discount_code?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          id?: string
          offer_id: string
          paid_at?: string | null
          payment_required?: boolean
          payment_waived?: boolean
          products?: Json
          reach_after?: number | null
          reach_before?: number | null
          rejection_reason?: string | null
          remaining_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string
          targeting?: Json | null
          targeting_changed?: boolean
          tier_after?: string | null
          tier_before?: string | null
          updated_at?: string
          uplift_pence?: number
        }
        Update: {
          body_copy?: string | null
          brand_user_id?: string
          checkout_started_at?: string | null
          created_at?: string
          discount_code?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          id?: string
          offer_id?: string
          paid_at?: string | null
          payment_required?: boolean
          payment_waived?: boolean
          products?: Json
          reach_after?: number | null
          reach_before?: number | null
          rejection_reason?: string | null
          remaining_days?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string
          targeting?: Json | null
          targeting_changed?: boolean
          tier_after?: string | null
          tier_before?: string | null
          updated_at?: string
          uplift_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_revisions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_stats_archive_2026_07: {
        Row: {
          code_copies: number
          created_at: string
          id: string
          impressions: number
          link_clicks: number
          offer_id: string
          slot: Database["public"]["Enums"]["brand_placement_slot"] | null
          stat_date: string
          taps: number
          updated_at: string
          wishlist_adds: number
        }
        Insert: {
          code_copies?: number
          created_at?: string
          id?: string
          impressions?: number
          link_clicks?: number
          offer_id: string
          slot?: Database["public"]["Enums"]["brand_placement_slot"] | null
          stat_date?: string
          taps?: number
          updated_at?: string
          wishlist_adds?: number
        }
        Update: {
          code_copies?: number
          created_at?: string
          id?: string
          impressions?: number
          link_clicks?: number
          offer_id?: string
          slot?: Database["public"]["Enums"]["brand_placement_slot"] | null
          stat_date?: string
          taps?: number
          updated_at?: string
          wishlist_adds?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_stats_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offer_targeting: {
        Row: {
          attribute_key: string
          created_at: string
          id: string
          offer_id: string
          value_code: string
        }
        Insert: {
          attribute_key: string
          created_at?: string
          id?: string
          offer_id: string
          value_code: string
        }
        Update: {
          attribute_key?: string
          created_at?: string
          id?: string
          offer_id?: string
          value_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_offer_targeting_attribute_key_value_code_fkey"
            columns: ["attribute_key", "value_code"]
            isOneToOne: false
            referencedRelation: "ad_targeting_attributes"
            referencedColumns: ["attribute_key", "value_code"]
          },
          {
            foreignKeyName: "brand_offer_targeting_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_offers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attached_booking_url: string | null
          attached_pro_offer_id: string | null
          body_copy: string | null
          brand_last_interest_seen_at: string | null
          brand_user_id: string
          created_at: string
          currency: string
          discount_code: string | null
          ends_on: string | null
          external_url: string | null
          headline: string | null
          hero_image_path: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          owner_type: string
          paid_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          relaunch_notified_at: string | null
          relaunched_from_offer_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          submitted_at: string | null
          targeting_changed_at: string | null
          total_price_pence: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attached_booking_url?: string | null
          attached_pro_offer_id?: string | null
          body_copy?: string | null
          brand_last_interest_seen_at?: string | null
          brand_user_id: string
          created_at?: string
          currency?: string
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          owner_type?: string
          paid_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          relaunch_notified_at?: string | null
          relaunched_from_offer_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          targeting_changed_at?: string | null
          total_price_pence?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attached_booking_url?: string | null
          attached_pro_offer_id?: string | null
          body_copy?: string | null
          brand_last_interest_seen_at?: string | null
          brand_user_id?: string
          created_at?: string
          currency?: string
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          owner_type?: string
          paid_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          relaunch_notified_at?: string | null
          relaunched_from_offer_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          targeting_changed_at?: string | null
          total_price_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_offers_attached_pro_offer_id_fkey"
            columns: ["attached_pro_offer_id"]
            isOneToOne: false
            referencedRelation: "pro_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_offers_relaunched_from_offer_id_fkey"
            columns: ["relaunched_from_offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_product_stats_daily: {
        Row: {
          brand_product_id: string
          code_copies: number
          expands: number
          link_clicks: number
          members: number
          rolled_up_at: string
          stat_date: string
        }
        Insert: {
          brand_product_id: string
          code_copies?: number
          expands?: number
          link_clicks?: number
          members?: number
          rolled_up_at?: string
          stat_date: string
        }
        Update: {
          brand_product_id?: string
          code_copies?: number
          expands?: number
          link_clicks?: number
          members?: number
          rolled_up_at?: string
          stat_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_product_stats_daily_brand_product_id_fkey"
            columns: ["brand_product_id"]
            isOneToOne: false
            referencedRelation: "brand_products"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_products: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          brand_user_id: string | null
          created_at: string
          description: string | null
          external_url: string | null
          id: string
          image_urls: string[] | null
          ingredients: string[] | null
          ingredients_source: string | null
          is_published: boolean
          key_features: string[]
          kind: string
          linked_product_id: string | null
          materials: string[]
          name: string
          position: number
          rejection_reason: string | null
          source_type: string
          source_url: string | null
          tool_kind: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_user_id?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_urls?: string[] | null
          ingredients?: string[] | null
          ingredients_source?: string | null
          is_published?: boolean
          key_features?: string[]
          kind?: string
          linked_product_id?: string | null
          materials?: string[]
          name: string
          position?: number
          rejection_reason?: string | null
          source_type: string
          source_url?: string | null
          tool_kind?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_user_id?: string | null
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_urls?: string[] | null
          ingredients?: string[] | null
          ingredients_source?: string | null
          is_published?: boolean
          key_features?: string[]
          kind?: string
          linked_product_id?: string | null
          materials?: string[]
          name?: string
          position?: number
          rejection_reason?: string | null
          source_type?: string
          source_url?: string | null
          tool_kind?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_profile_admin_edits: {
        Row: {
          admin_user_id: string
          brand_user_id: string
          changes: Json
          created_at: string
          id: string
        }
        Insert: {
          admin_user_id: string
          brand_user_id: string
          changes: Json
          created_at?: string
          id?: string
        }
        Update: {
          admin_user_id?: string
          brand_user_id?: string
          changes?: Json
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          about: string | null
          blood_tests_verified_at: string | null
          blood_tests_verified_by: string | null
          brand_colour_on_primary: string | null
          brand_colour_primary: string | null
          brand_colour_secondary: string | null
          brand_colour_source: string | null
          brand_colour_updated_at: string | null
          brand_name: string
          category: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          hidden_from_directory: boolean
          id: string
          instagram_handle: string | null
          logo_path: string | null
          offers_at_home_blood_tests_claimed: boolean
          offers_at_home_blood_tests_verified: boolean
          sells_supplements_claimed: boolean
          sells_supplements_verified: boolean
          supplements_verified_at: string | null
          supplements_verified_by: string | null
          tiktok_handle: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          about?: string | null
          blood_tests_verified_at?: string | null
          blood_tests_verified_by?: string | null
          brand_colour_on_primary?: string | null
          brand_colour_primary?: string | null
          brand_colour_secondary?: string | null
          brand_colour_source?: string | null
          brand_colour_updated_at?: string | null
          brand_name: string
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          hidden_from_directory?: boolean
          id?: string
          instagram_handle?: string | null
          logo_path?: string | null
          offers_at_home_blood_tests_claimed?: boolean
          offers_at_home_blood_tests_verified?: boolean
          sells_supplements_claimed?: boolean
          sells_supplements_verified?: boolean
          supplements_verified_at?: string | null
          supplements_verified_by?: string | null
          tiktok_handle?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          about?: string | null
          blood_tests_verified_at?: string | null
          blood_tests_verified_by?: string | null
          brand_colour_on_primary?: string | null
          brand_colour_primary?: string | null
          brand_colour_secondary?: string | null
          brand_colour_source?: string | null
          brand_colour_updated_at?: string | null
          brand_name?: string
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          hidden_from_directory?: boolean
          id?: string
          instagram_handle?: string | null
          logo_path?: string | null
          offers_at_home_blood_tests_claimed?: boolean
          offers_at_home_blood_tests_verified?: boolean
          sells_supplements_claimed?: boolean
          sells_supplements_verified?: boolean
          supplements_verified_at?: string | null
          supplements_verified_by?: string | null
          tiktok_handle?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      brand_subscriptions: {
        Row: {
          brand_user_id: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          price_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          brand_user_id: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_user_id?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_tags: {
        Row: {
          brand_id: string | null
          created_at: string
          created_by_user_id: string
          custom_brand_name: string | null
          disclosure_label: string | null
          id: string
          promotion_ends_on: string | null
          promotion_starts_on: string | null
          tag_type: Database["public"]["Enums"]["brand_tag_type"]
          taggable_id: string
          taggable_type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id: string
          custom_brand_name?: string | null
          disclosure_label?: string | null
          id?: string
          promotion_ends_on?: string | null
          promotion_starts_on?: string | null
          tag_type: Database["public"]["Enums"]["brand_tag_type"]
          taggable_id: string
          taggable_type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          created_by_user_id?: string
          custom_brand_name?: string | null
          disclosure_label?: string | null
          id?: string
          promotion_ends_on?: string | null
          promotion_starts_on?: string | null
          tag_type?: Database["public"]["Enums"]["brand_tag_type"]
          taggable_id?: string
          taggable_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_tags_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          meta: Json
          read_at: string | null
          sender_id: string | null
          sender_role: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          read_at?: string | null
          sender_id?: string | null
          sender_role?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          read_at?: string | null
          sender_id?: string | null
          sender_role?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          admin_user_id: string | null
          consumer_id: string | null
          created_at: string
          enquiry_id: string | null
          id: string
          last_message_at: string | null
          member_a_id: string | null
          member_b_id: string | null
          pro_user_id: string | null
          subject_role: string | null
          subject_user_id: string | null
          thread_type: string
        }
        Insert: {
          admin_user_id?: string | null
          consumer_id?: string | null
          created_at?: string
          enquiry_id?: string | null
          id?: string
          last_message_at?: string | null
          member_a_id?: string | null
          member_b_id?: string | null
          pro_user_id?: string | null
          subject_role?: string | null
          subject_user_id?: string | null
          thread_type?: string
        }
        Update: {
          admin_user_id?: string | null
          consumer_id?: string | null
          created_at?: string
          enquiry_id?: string | null
          id?: string
          last_message_at?: string | null
          member_a_id?: string | null
          member_b_id?: string | null
          pro_user_id?: string | null
          subject_role?: string | null
          subject_user_id?: string | null
          thread_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: true
            referencedRelation: "pro_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      consumer_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          pause_resumes_at: string | null
          paused: boolean
          price_id: string | null
          retention_offer_claimed_at: string | null
          retention_offer_used: boolean
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_end: string | null
          updated_at: string
          user_id: string
          welcome_dm_sent_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          pause_resumes_at?: string | null
          paused?: boolean
          price_id?: string | null
          retention_offer_claimed_at?: string | null
          retention_offer_used?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
          welcome_dm_sent_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          pause_resumes_at?: string | null
          paused?: boolean
          price_id?: string | null
          retention_offer_claimed_at?: string | null
          retention_offer_used?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
          welcome_dm_sent_at?: string | null
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          subject: string
          user_id: string | null
          was_authenticated: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          subject: string
          user_id?: string | null
          was_authenticated?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          subject?: string
          user_id?: string | null
          was_authenticated?: boolean
        }
        Relationships: []
      }
      content_collections: {
        Row: {
          cover_path: string | null
          created_at: string
          description: string
          id: string
          is_published: boolean
          kind: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          kind: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          kind?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          body_md: string | null
          collection_id: string
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          id: string
          kind: string
          sort_order: number
          storage_path: string | null
          thumbnail_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          collection_id: string
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          kind: string
          sort_order?: number
          storage_path?: string | null
          thumbnail_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          collection_id?: string
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          id?: string
          kind?: string
          sort_order?: number
          storage_path?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "content_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      content_progress: {
        Row: {
          completed_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      country_waitlist: {
        Row: {
          blocked_at: string | null
          country: string
          created_at: string
          email: string
          id: string
          ip_detected_country: string | null
          klaviyo_error: string | null
          klaviyo_synced_at: string | null
          name: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          blocked_at?: string | null
          country: string
          created_at?: string
          email: string
          id?: string
          ip_detected_country?: string | null
          klaviyo_error?: string | null
          klaviyo_synced_at?: string | null
          name: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          blocked_at?: string | null
          country?: string
          created_at?: string
          email?: string
          id?: string
          ip_detected_country?: string | null
          klaviyo_error?: string | null
          klaviyo_synced_at?: string | null
          name?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      curated_content: {
        Row: {
          content_key: string
          created_at: string
          generated_at: string
          id: string
          manuscript_grounded: boolean
          model_version: string | null
          payload: Json
          published_at: string | null
          source_passages: Json
          status: string
          updated_at: string
        }
        Insert: {
          content_key: string
          created_at?: string
          generated_at?: string
          id?: string
          manuscript_grounded?: boolean
          model_version?: string | null
          payload?: Json
          published_at?: string | null
          source_passages?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          content_key?: string
          created_at?: string
          generated_at?: string
          id?: string
          manuscript_grounded?: boolean
          model_version?: string | null
          payload?: Json
          published_at?: string | null
          source_passages?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      curated_offers: {
        Row: {
          brand_name: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_code: string | null
          ends_on: string | null
          external_url: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          image_path: string | null
          is_active: boolean
          sort_order: number
          starts_on: string | null
          title: string
          updated_at: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          sort_order?: number
          starts_on?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          sort_order?: number
          starts_on?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_hair_entries: {
        Row: {
          created_at: string
          entry_at: string
          entry_date: string
          id: string
          note: string | null
          product_ids: string[]
          updated_at: string
          user_id: string
          voice_path: string | null
        }
        Insert: {
          created_at?: string
          entry_at?: string
          entry_date: string
          id?: string
          note?: string | null
          product_ids?: string[]
          updated_at?: string
          user_id: string
          voice_path?: string | null
        }
        Update: {
          created_at?: string
          entry_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          product_ids?: string[]
          updated_at?: string
          user_id?: string
          voice_path?: string | null
        }
        Relationships: []
      }
      data_protection_complaints: {
        Row: {
          acknowledged_at: string | null
          admin_notes: string | null
          contact_email: string
          created_at: string
          details: string
          id: string
          resolution_summary: string | null
          resolved_at: string | null
          status: string
          subject: string
          submitted_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          contact_email: string
          created_at?: string
          details: string
          id?: string
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          submitted_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          contact_email?: string
          created_at?: string
          details?: string
          id?: string
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          attempts: number
          category: string
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          max_attempts: number
          next_attempt_at: string | null
          payload: Json | null
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          related_id: string | null
          related_table: string | null
          sent_at: string | null
          status: string
          subject: string | null
          suppressed_reason: string | null
          template_key: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          category?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          related_id?: string | null
          related_table?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppressed_reason?: string | null
          template_key: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          category?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          related_id?: string | null
          related_table?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          suppressed_reason?: string | null
          template_key?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          appointment_reminders: boolean
          blood_test_due: boolean
          brand_offers: boolean
          created_at: string
          enquiry_updates: boolean
          forum_replies: boolean
          marketing_consent: boolean
          marketing_consent_at: string | null
          treatment_checkin_reminders: boolean
          treatment_weekly_digest: boolean
          unsubscribe_token: string
          updated_at: string
          user_id: string
          wash_day_reminders: boolean
        }
        Insert: {
          appointment_reminders?: boolean
          blood_test_due?: boolean
          brand_offers?: boolean
          created_at?: string
          enquiry_updates?: boolean
          forum_replies?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          treatment_checkin_reminders?: boolean
          treatment_weekly_digest?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id: string
          wash_day_reminders?: boolean
        }
        Update: {
          appointment_reminders?: boolean
          blood_test_due?: boolean
          brand_offers?: boolean
          created_at?: string
          enquiry_updates?: boolean
          forum_replies?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          treatment_checkin_reminders?: boolean
          treatment_weekly_digest?: boolean
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string
          wash_day_reminders?: boolean
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          cancelled_at: string | null
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          cancelled_at: string | null
          capacity: number | null
          cover_path: string | null
          created_at: string
          created_by: string | null
          description: string
          ends_at: string | null
          id: string
          join_url: string | null
          kind: string
          starts_at: string
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          address?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string | null
          id?: string
          join_url?: string | null
          kind?: string
          starts_at: string
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          address?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string | null
          id?: string
          join_url?: string | null
          kind?: string
          starts_at?: string
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      forum_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      forum_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      forum_mentions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          target_id: string
          target_kind: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          target_id: string
          target_kind: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          target_id?: string
          target_kind?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_mentions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          depth: number
          id: string
          parent_reply_id: string | null
          thread_id: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          depth?: number
          id?: string
          parent_reply_id?: string | null
          thread_id: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          depth?: number
          id?: string
          parent_reply_id?: string | null
          thread_id?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "forum_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_replies_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "forum_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: []
      }
      forum_threads: {
        Row: {
          author_id: string
          body: string
          category_id: string
          created_at: string
          id: string
          image_path: string | null
          is_locked: boolean
          is_pinned: boolean
          reply_count: number
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          author_id: string
          body?: string
          category_id: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_locked?: boolean
          is_pinned?: boolean
          reply_count?: number
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          category_id?: string
          created_at?: string
          id?: string
          image_path?: string | null
          is_locked?: boolean
          is_pinned?: boolean
          reply_count?: number
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "forum_threads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "forum_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_votes: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_kind: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_kind: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_kind?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      glossary_terms: {
        Row: {
          aliases: string[]
          category: string | null
          class_category: string | null
          created_at: string
          display_name: string
          id: string
          inci_key: string
          is_common: boolean
          kind: string
          match_keywords: string[]
          model_version: string | null
          phonetic: string | null
          updated_at: string
          what_it_is: string | null
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          class_category?: string | null
          created_at?: string
          display_name: string
          id?: string
          inci_key: string
          is_common?: boolean
          kind?: string
          match_keywords?: string[]
          model_version?: string | null
          phonetic?: string | null
          updated_at?: string
          what_it_is?: string | null
        }
        Update: {
          aliases?: string[]
          category?: string | null
          class_category?: string | null
          created_at?: string
          display_name?: string
          id?: string
          inci_key?: string
          is_common?: boolean
          kind?: string
          match_keywords?: string[]
          model_version?: string | null
          phonetic?: string | null
          updated_at?: string
          what_it_is?: string | null
        }
        Relationships: []
      }
      goal_progress_updates: {
        Row: {
          audio_path: string | null
          body_text: string | null
          created_at: string
          goal_id: string
          id: string
          photo_entry_ref: string | null
          transcription_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          body_text?: string | null
          created_at?: string
          goal_id: string
          id?: string
          photo_entry_ref?: string | null
          transcription_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_path?: string | null
          body_text?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          photo_entry_ref?: string | null
          transcription_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "user_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_updates: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          note: string | null
          user_id: string
          voice_url: string | null
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          note?: string | null
          user_id: string
          voice_url?: string | null
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          user_id?: string
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "user_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      hair_concepts: {
        Row: {
          created_at: string
          definition: string
          domain: string
          id: string
          label: string
          manuscript_source: string
        }
        Insert: {
          created_at?: string
          definition: string
          domain: string
          id: string
          label: string
          manuscript_source: string
        }
        Update: {
          created_at?: string
          definition?: string
          domain?: string
          id?: string
          label?: string
          manuscript_source?: string
        }
        Relationships: []
      }
      hair_relationships: {
        Row: {
          created_at: string
          id: string
          manuscript_source: string
          object: string
          polarity: string
          reason: string
          relation: string
          subject: string
        }
        Insert: {
          created_at?: string
          id: string
          manuscript_source: string
          object: string
          polarity: string
          reason: string
          relation: string
          subject: string
        }
        Update: {
          created_at?: string
          id?: string
          manuscript_source?: string
          object?: string
          polarity?: string
          reason?: string
          relation?: string
          subject?: string
        }
        Relationships: []
      }
      hair_strand_summaries: {
        Row: {
          action_plan: Json
          context_snapshot: Json | null
          created_at: string
          id: string
          input_hash: string | null
          overview: string
          routine_tips: Json
          user_id: string
        }
        Insert: {
          action_plan?: Json
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          input_hash?: string | null
          overview: string
          routine_tips?: Json
          user_id: string
        }
        Update: {
          action_plan?: Json
          context_snapshot?: Json | null
          created_at?: string
          id?: string
          input_hash?: string | null
          overview?: string
          routine_tips?: Json
          user_id?: string
        }
        Relationships: []
      }
      industry_manuscript_conflicts: {
        Row: {
          author_note: string | null
          chapter: number | null
          created_at: string
          evidence_set_id: string | null
          function_name: string | null
          id: string
          industry_position: string
          industry_source: string | null
          ingredient: string
          last_seen_at: string
          manuscript_position: string
          manuscript_quote: string | null
          occurrences: number
          offending_text: string | null
          page_start: number | null
          resolution: string
          status: string
          surface: string | null
          topic: string | null
          user_id: string | null
        }
        Insert: {
          author_note?: string | null
          chapter?: number | null
          created_at?: string
          evidence_set_id?: string | null
          function_name?: string | null
          id?: string
          industry_position: string
          industry_source?: string | null
          ingredient: string
          last_seen_at?: string
          manuscript_position: string
          manuscript_quote?: string | null
          occurrences?: number
          offending_text?: string | null
          page_start?: number | null
          resolution?: string
          status?: string
          surface?: string | null
          topic?: string | null
          user_id?: string | null
        }
        Update: {
          author_note?: string | null
          chapter?: number | null
          created_at?: string
          evidence_set_id?: string | null
          function_name?: string | null
          id?: string
          industry_position?: string
          industry_source?: string | null
          ingredient?: string
          last_seen_at?: string
          manuscript_position?: string
          manuscript_quote?: string | null
          occurrences?: number
          offending_text?: string | null
          page_start?: number | null
          resolution?: string
          status?: string
          surface?: string | null
          topic?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_manuscript_conflicts_evidence_set_id_fkey"
            columns: ["evidence_set_id"]
            isOneToOne: false
            referencedRelation: "tip_evidence_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_lists: {
        Row: {
          id: string
          ingredient: string
          list_kind: string
          product_count: number
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          ingredient: string
          list_kind: string
          product_count?: number
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          ingredient?: string
          list_kind?: string
          product_count?: number
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_notify_config: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          cover_media_id: string | null
          cover_path: string | null
          created_at: string
          entry_date: string
          id: string
          mood: string | null
          note: string | null
          photo_paths: string[]
          products_used: string[]
          status: string
          style_date: string | null
          style_name: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_media_id?: string | null
          cover_path?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          note?: string | null
          photo_paths?: string[]
          products_used?: string[]
          status?: string
          style_date?: string | null
          style_name?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_media_id?: string | null
          cover_path?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          note?: string | null
          photo_paths?: string[]
          products_used?: string[]
          status?: string
          style_date?: string | null
          style_name?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "journal_step_media"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_step_media: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          kind: string
          poster_path: string | null
          sort_order: number
          step_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind: string
          poster_path?: string | null
          sort_order?: number
          step_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: string
          poster_path?: string | null
          sort_order?: number
          step_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_step_media_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "journal_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_step_products: {
        Row: {
          created_at: string
          id: string
          step_id: string
          user_product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          step_id: string
          user_product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          step_id?: string
          user_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_step_products_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "journal_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_step_products_user_product_id_fkey"
            columns: ["user_product_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_step_tools: {
        Row: {
          created_at: string
          id: string
          step_id: string
          user_tool_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          step_id: string
          user_tool_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          step_id?: string
          user_tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_step_tools_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "journal_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_step_tools_user_tool_id_fkey"
            columns: ["user_tool_id"]
            isOneToOne: false
            referencedRelation: "user_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_steps: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          note: string | null
          step_order: number
          updated_at: string
          voice_path: string | null
          voice_transcript: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          note?: string | null
          step_order: number
          updated_at?: string
          voice_path?: string | null
          voice_transcript?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          note?: string | null
          step_order?: number
          updated_at?: string
          voice_path?: string | null
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_steps_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      klaviyo_sync_log: {
        Row: {
          action: string
          context: Json | null
          created_at: string
          email: string | null
          error: string | null
          id: string
          list_id: string | null
          ok: boolean
          user_id: string | null
        }
        Insert: {
          action: string
          context?: Json | null
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          list_id?: string | null
          ok: boolean
          user_id?: string | null
        }
        Update: {
          action?: string
          context?: Json | null
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          list_id?: string | null
          ok?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      manuscript_chunks: {
        Row: {
          body: string
          chapter: number
          chapter_title: string | null
          created_at: string
          embedding: string
          id: string
          page_end: number | null
          page_start: number | null
          section_heading: string | null
          token_count: number | null
        }
        Insert: {
          body: string
          chapter: number
          chapter_title?: string | null
          created_at?: string
          embedding: string
          id?: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          token_count?: number | null
        }
        Update: {
          body?: string
          chapter?: number
          chapter_title?: string | null
          created_at?: string
          embedding?: string
          id?: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          token_count?: number | null
        }
        Relationships: []
      }
      manuscript_chunks_v2: {
        Row: {
          body: string
          callout_type: string | null
          chapter: number
          chapter_title: string | null
          created_at: string
          embedding: string | null
          id: string
          ingest_version: string
          page_end: number | null
          page_start: number | null
          section_heading: string | null
          token_count: number | null
        }
        Insert: {
          body: string
          callout_type?: string | null
          chapter: number
          chapter_title?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          ingest_version?: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          token_count?: number | null
        }
        Update: {
          body?: string
          callout_type?: string | null
          chapter?: number
          chapter_title?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          ingest_version?: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          token_count?: number | null
        }
        Relationships: []
      }
      manuscript_evidence_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          payload: Json
          revision: string
          surface: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          payload: Json
          revision: string
          surface: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          revision?: string
          surface?: string
        }
        Relationships: []
      }
      manuscript_ingredients: {
        Row: {
          aliases: string[]
          author_position: string | null
          author_text: string
          category: string | null
          chapter: number
          created_at: string
          id: string
          ingredient: string
          page_end: number | null
          page_start: number | null
          section_heading: string | null
          status: string
        }
        Insert: {
          aliases?: string[]
          author_position?: string | null
          author_text: string
          category?: string | null
          chapter: number
          created_at?: string
          id?: string
          ingredient: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          status?: string
        }
        Update: {
          aliases?: string[]
          author_position?: string | null
          author_text?: string
          category?: string | null
          chapter?: number
          created_at?: string
          id?: string
          ingredient?: string
          page_end?: number | null
          page_start?: number | null
          section_heading?: string | null
          status?: string
        }
        Relationships: []
      }
      manuscript_terminology: {
        Row: {
          accurate_explanation: string | null
          author_position: string
          banned_phrasings: string[]
          chapter: number
          created_at: string
          id: string
          loose_usage: string | null
          mode: string
          page_end: number | null
          page_start: number | null
          reserved_for: string | null
          source_quote: string
          status: string
          term: string
          updated_at: string
        }
        Insert: {
          accurate_explanation?: string | null
          author_position: string
          banned_phrasings?: string[]
          chapter: number
          created_at?: string
          id?: string
          loose_usage?: string | null
          mode?: string
          page_end?: number | null
          page_start?: number | null
          reserved_for?: string | null
          source_quote: string
          status?: string
          term: string
          updated_at?: string
        }
        Update: {
          accurate_explanation?: string | null
          author_position?: string
          banned_phrasings?: string[]
          chapter?: number
          created_at?: string
          id?: string
          loose_usage?: string | null
          mode?: string
          page_end?: number | null
          page_start?: number | null
          reserved_for?: string | null
          source_quote?: string
          status?: string
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      meal_cook_logs: {
        Row: {
          cooked_at: string
          created_at: string
          id: string
          meal_id: string
          photo_path: string | null
          rating: number
          user_id: string
        }
        Insert: {
          cooked_at?: string
          created_at?: string
          id?: string
          meal_id: string
          photo_path?: string | null
          rating: number
          user_id: string
        }
        Update: {
          cooked_at?: string
          created_at?: string
          id?: string
          meal_id?: string
          photo_path?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_cook_logs_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "user_saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboard_images: {
        Row: {
          board_id: string
          caption: string | null
          created_at: string
          id: string
          is_favourite: boolean
          storage_path: string
          user_id: string
        }
        Insert: {
          board_id: string
          caption?: string | null
          created_at?: string
          id?: string
          is_favourite?: boolean
          storage_path: string
          user_id: string
        }
        Update: {
          board_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          is_favourite?: boolean
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_images_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboards: {
        Row: {
          cover_storage_path: string | null
          created_at: string
          emoji: string
          gradient: string
          id: string
          is_favourites: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_storage_path?: string | null
          created_at?: string
          emoji?: string
          gradient?: string
          id?: string
          is_favourites?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_storage_path?: string | null
          created_at?: string
          emoji?: string
          gradient?: string
          id?: string
          is_favourites?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          read_at: string | null
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      onboarding_drafts: {
        Row: {
          draft_key: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          draft_key: string
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          draft_key?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_pricing_changes: {
        Row: {
          changed_by: string | null
          created_at: string
          currency: string
          id: string
          interval: string
          new_amount_gbp: number
          new_price_id: string
          notes: string | null
          old_amount_gbp: number | null
          old_price_id: string | null
          product_kind: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          new_amount_gbp: number
          new_price_id: string
          notes?: string | null
          old_amount_gbp?: number | null
          old_price_id?: string | null
          product_kind: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          new_amount_gbp?: number
          new_price_id?: string
          notes?: string | null
          old_amount_gbp?: number | null
          old_price_id?: string | null
          product_kind?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      pro_application_stylists: {
        Row: {
          application_id: string
          contact_email: string | null
          created_at: string
          discipline: Database["public"]["Enums"]["pro_discipline"] | null
          full_name: string
          id: string
          notes: string | null
          specialisms: string[]
        }
        Insert: {
          application_id: string
          contact_email?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["pro_discipline"] | null
          full_name: string
          id?: string
          notes?: string | null
          specialisms?: string[]
        }
        Update: {
          application_id?: string
          contact_email?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["pro_discipline"] | null
          full_name?: string
          id?: string
          notes?: string | null
          specialisms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pro_application_stylists_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "pro_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_applications: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          admin_notes: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          city: string | null
          created_at: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          email: string
          full_name: string
          id: string
          instagram_handle: string | null
          insurance_expiry: string | null
          insurance_policy_no: string | null
          insurance_provider: string | null
          is_salon: boolean
          location: string | null
          opening_hours: Json | null
          payment_confirmed_at: string | null
          postcode: string | null
          qualifications: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id: string | null
          stylist_consent_confirmed_at: string | null
          updated_at: string
          user_id: string | null
          website_url: string | null
          why_strand: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          admin_notes?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          city?: string | null
          created_at?: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          email: string
          full_name: string
          id?: string
          instagram_handle?: string | null
          insurance_expiry?: string | null
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          is_salon?: boolean
          location?: string | null
          opening_hours?: Json | null
          payment_confirmed_at?: string | null
          postcode?: string | null
          qualifications?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id?: string | null
          stylist_consent_confirmed_at?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
          why_strand?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          admin_notes?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          city?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["pro_discipline"]
          email?: string
          full_name?: string
          id?: string
          instagram_handle?: string | null
          insurance_expiry?: string | null
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          is_salon?: boolean
          location?: string | null
          opening_hours?: Json | null
          payment_confirmed_at?: string | null
          postcode?: string | null
          qualifications?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id?: string | null
          stylist_consent_confirmed_at?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
          why_strand?: string | null
        }
        Relationships: []
      }
      pro_booking_clicks: {
        Row: {
          appointment_id: string | null
          booking_url_at_click: string
          clicked_at: string
          created_at: string
          discount_code_shown: string | null
          id: string
          outcome: string | null
          professional_id: string
          prompted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          booking_url_at_click: string
          clicked_at?: string
          created_at?: string
          discount_code_shown?: string | null
          id?: string
          outcome?: string | null
          professional_id: string
          prompted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          booking_url_at_click?: string
          clicked_at?: string
          created_at?: string
          discount_code_shown?: string | null
          id?: string
          outcome?: string | null
          professional_id?: string
          prompted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_booking_clicks_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_capability_audit: {
        Row: {
          action: string
          actor_id: string | null
          capability: string
          created_at: string
          id: string
          new_value: Json | null
          note: string | null
          previous_value: Json | null
          pro_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          capability: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          pro_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          capability?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          pro_user_id?: string
        }
        Relationships: []
      }
      pro_client_access: {
        Row: {
          consumer_id: string
          created_at: string
          enquiry_id: string | null
          granted_at: string
          id: string
          pro_user_id: string
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          consumer_id: string
          created_at?: string
          enquiry_id?: string | null
          granted_at?: string
          id?: string
          pro_user_id: string
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          consumer_id?: string
          created_at?: string
          enquiry_id?: string | null
          granted_at?: string
          id?: string
          pro_user_id?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_client_access_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "pro_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_client_notes: {
        Row: {
          consumer_id: string
          created_at: string
          id: string
          note: string
          pro_user_id: string
          updated_at: string
        }
        Insert: {
          consumer_id: string
          created_at?: string
          id?: string
          note: string
          pro_user_id: string
          updated_at?: string
        }
        Update: {
          consumer_id?: string
          created_at?: string
          id?: string
          note?: string
          pro_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pro_enquiries: {
        Row: {
          budget_range: string | null
          consumer_id: string
          contact_method: string | null
          contact_phone: string | null
          created_at: string
          decline_reason: string | null
          id: string
          location_preference: string | null
          note: string | null
          preferred_timeframe: string | null
          pro_profile_id: string | null
          pro_user_id: string
          responded_at: string | null
          sender_role: string
          service_interest: string | null
          share_passport_consent: boolean
          status: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at: string
        }
        Insert: {
          budget_range?: string | null
          consumer_id: string
          contact_method?: string | null
          contact_phone?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          location_preference?: string | null
          note?: string | null
          preferred_timeframe?: string | null
          pro_profile_id?: string | null
          pro_user_id: string
          responded_at?: string | null
          sender_role?: string
          service_interest?: string | null
          share_passport_consent?: boolean
          status?: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at?: string
        }
        Update: {
          budget_range?: string | null
          consumer_id?: string
          contact_method?: string | null
          contact_phone?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          location_preference?: string | null
          note?: string | null
          preferred_timeframe?: string | null
          pro_profile_id?: string | null
          pro_user_id?: string
          responded_at?: string | null
          sender_role?: string
          service_interest?: string | null
          share_passport_consent?: boolean
          status?: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_enquiries_pro_profile_id_fkey"
            columns: ["pro_profile_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_offers: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          pro_user_id: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          pro_user_id: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          pro_user_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pro_passport_views: {
        Row: {
          consumer_id: string
          id: string
          pro_user_id: string
          section: string | null
          viewed_at: string
        }
        Insert: {
          consumer_id: string
          id?: string
          pro_user_id: string
          section?: string | null
          viewed_at?: string
        }
        Update: {
          consumer_id?: string
          id?: string
          pro_user_id?: string
          section?: string | null
          viewed_at?: string
        }
        Relationships: []
      }
      pro_passport_visibility: {
        Row: {
          id: string
          section: string
          updated_at: string
          user_id: string
          visible: boolean
        }
        Insert: {
          id?: string
          section: string
          updated_at?: string
          user_id: string
          visible?: boolean
        }
        Update: {
          id?: string
          section?: string
          updated_at?: string
          user_id?: string
          visible?: boolean
        }
        Relationships: []
      }
      pro_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_path: string | null
          bio: string | null
          bloods_claim_status: string
          bloods_review_note: string | null
          bloods_setting: string | null
          bloods_verified_at: string | null
          bloods_verified_by: string | null
          booking_url: string | null
          business_email: string | null
          business_phone: string | null
          can_take_bloods_claimed: boolean
          can_take_bloods_verified: boolean
          city: string | null
          contact_email: string | null
          cover_path: string | null
          created_at: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          discount_active: boolean
          discount_code: string | null
          discount_description: string | null
          display_name: string
          doctor_claim_status: string
          doctor_review_note: string | null
          doctor_verified_at: string | null
          doctor_verified_by: string | null
          featured_from: string | null
          featured_rank: number | null
          featured_until: string | null
          gmc_number: string | null
          id: string
          instagram_handle: string | null
          is_doctor_claimed: boolean
          is_doctor_verified: boolean
          is_published: boolean
          listing_tier: Database["public"]["Enums"]["pro_listing_tier"]
          location: string | null
          opening_hours: Json | null
          photos: string[]
          postcode: string | null
          profile_review_status: Database["public"]["Enums"]["pro_profile_review_status"]
          qualifications: string[]
          referral_fee_percent: number | null
          review_note: string | null
          reviewed_at: string | null
          salon_id: string | null
          services: Json
          specialisms: string[]
          submitted_at: string | null
          suspended_at: string | null
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          bio?: string | null
          bloods_claim_status?: string
          bloods_review_note?: string | null
          bloods_setting?: string | null
          bloods_verified_at?: string | null
          bloods_verified_by?: string | null
          booking_url?: string | null
          business_email?: string | null
          business_phone?: string | null
          can_take_bloods_claimed?: boolean
          can_take_bloods_verified?: boolean
          city?: string | null
          contact_email?: string | null
          cover_path?: string | null
          created_at?: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          discount_active?: boolean
          discount_code?: string | null
          discount_description?: string | null
          display_name: string
          doctor_claim_status?: string
          doctor_review_note?: string | null
          doctor_verified_at?: string | null
          doctor_verified_by?: string | null
          featured_from?: string | null
          featured_rank?: number | null
          featured_until?: string | null
          gmc_number?: string | null
          id?: string
          instagram_handle?: string | null
          is_doctor_claimed?: boolean
          is_doctor_verified?: boolean
          is_published?: boolean
          listing_tier?: Database["public"]["Enums"]["pro_listing_tier"]
          location?: string | null
          opening_hours?: Json | null
          photos?: string[]
          postcode?: string | null
          profile_review_status?: Database["public"]["Enums"]["pro_profile_review_status"]
          qualifications?: string[]
          referral_fee_percent?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          salon_id?: string | null
          services?: Json
          specialisms?: string[]
          submitted_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          bio?: string | null
          bloods_claim_status?: string
          bloods_review_note?: string | null
          bloods_setting?: string | null
          bloods_verified_at?: string | null
          bloods_verified_by?: string | null
          booking_url?: string | null
          business_email?: string | null
          business_phone?: string | null
          can_take_bloods_claimed?: boolean
          can_take_bloods_verified?: boolean
          city?: string | null
          contact_email?: string | null
          cover_path?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["pro_discipline"]
          discount_active?: boolean
          discount_code?: string | null
          discount_description?: string | null
          display_name?: string
          doctor_claim_status?: string
          doctor_review_note?: string | null
          doctor_verified_at?: string | null
          doctor_verified_by?: string | null
          featured_from?: string | null
          featured_rank?: number | null
          featured_until?: string | null
          gmc_number?: string | null
          id?: string
          instagram_handle?: string | null
          is_doctor_claimed?: boolean
          is_doctor_verified?: boolean
          is_published?: boolean
          listing_tier?: Database["public"]["Enums"]["pro_listing_tier"]
          location?: string | null
          opening_hours?: Json | null
          photos?: string[]
          postcode?: string | null
          profile_review_status?: Database["public"]["Enums"]["pro_profile_review_status"]
          qualifications?: string[]
          referral_fee_percent?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          salon_id?: string | null
          services?: Json
          specialisms?: string[]
          submitted_at?: string | null
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_profiles_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_referral_attributions: {
        Row: {
          amount_owed: number | null
          appointment_id: string | null
          booking_value: number | null
          consumer_id: string
          created_at: string
          directory_id: string | null
          enquiry_id: string | null
          event_type: string
          id: string
          notes: string | null
          pro_user_id: string | null
          updated_at: string
        }
        Insert: {
          amount_owed?: number | null
          appointment_id?: string | null
          booking_value?: number | null
          consumer_id: string
          created_at?: string
          directory_id?: string | null
          enquiry_id?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          pro_user_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_owed?: number | null
          appointment_id?: string | null
          booking_value?: number | null
          consumer_id?: string
          created_at?: string
          directory_id?: string | null
          enquiry_id?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          pro_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_referral_attributions_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "professionals_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_referral_attributions_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "pro_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_referral_clicks: {
        Row: {
          created_at: string
          directory_id: string | null
          id: string
          pro_user_id: string | null
          target_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          directory_id?: string | null
          id?: string
          pro_user_id?: string | null
          target_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          directory_id?: string | null
          id?: string
          pro_user_id?: string | null
          target_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_referral_clicks_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "professionals_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          price_id: string | null
          pro_user_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          pro_user_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          pro_user_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_analysis_backfill: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          processed_at: string | null
          product_key: string | null
          status: string
          updated_at: string
          user_id: string
          user_product_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          product_key?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_product_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          processed_at?: string | null
          product_key?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_analysis_backfill_user_product_id_fkey"
            columns: ["user_product_id"]
            isOneToOne: true
            referencedRelation: "user_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredient_facts: {
        Row: {
          created_at: string
          facts: Json
          id: string
          identity_key: string
          ingredient_names: Json
          ingredients_hash: string
          model_version: string
          product_brand: string | null
          product_name: string | null
          source_function: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          facts?: Json
          id?: string
          identity_key: string
          ingredient_names?: Json
          ingredients_hash: string
          model_version: string
          product_brand?: string | null
          product_name?: string | null
          source_function?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          facts?: Json
          id?: string
          identity_key?: string
          ingredient_names?: Json
          ingredients_hash?: string
          model_version?: string
          product_brand?: string | null
          product_name?: string | null
          source_function?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          position: number | null
          role_in_product: string | null
          updated_at: string
          user_product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          position?: number | null
          role_in_product?: string | null
          updated_at?: string
          user_product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          position?: number | null
          role_in_product?: string | null
          updated_at?: string
          user_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "glossary_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_user_product_id_fkey"
            columns: ["user_product_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ratings: {
        Row: {
          created_at: string
          id: string
          ingredients: string[]
          product_brand: string | null
          product_key: string
          product_name: string | null
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredients?: string[]
          product_brand?: string | null
          product_key: string
          product_name?: string | null
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredients?: string[]
          product_brand?: string | null
          product_key?: string
          product_name?: string | null
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_voicenotes: {
        Row: {
          audio_url: string
          created_at: string
          duration_sec: number | null
          id: string
          product_brand: string | null
          product_key: string
          product_name: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          product_brand?: string | null
          product_key: string
          product_name?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          product_brand?: string | null
          product_key?: string
          product_name?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      professionals_directory: {
        Row: {
          address: string | null
          bio: string | null
          booking_url: string | null
          clinic_name: string | null
          contact_email: string | null
          created_at: string
          discount_code: string | null
          discount_description: string | null
          id: string
          instagram_handle: string | null
          is_active: boolean
          listing_tier: Database["public"]["Enums"]["pro_listing_tier"]
          name: string
          postcode: string | null
          referral_fee_percent: number | null
          specialisms: string[]
          title: string
          type: Database["public"]["Enums"]["pro_type"]
          verification_number: string | null
          verification_type: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          booking_url?: string | null
          clinic_name?: string | null
          contact_email?: string | null
          created_at?: string
          discount_code?: string | null
          discount_description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          listing_tier?: Database["public"]["Enums"]["pro_listing_tier"]
          name: string
          postcode?: string | null
          referral_fee_percent?: number | null
          specialisms?: string[]
          title: string
          type: Database["public"]["Enums"]["pro_type"]
          verification_number?: string | null
          verification_type?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          booking_url?: string | null
          clinic_name?: string | null
          contact_email?: string | null
          created_at?: string
          discount_code?: string | null
          discount_description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          listing_tier?: Database["public"]["Enums"]["pro_listing_tier"]
          name?: string
          postcode?: string | null
          referral_fee_percent?: number | null
          specialisms?: string[]
          title?: string
          type?: Database["public"]["Enums"]["pro_type"]
          verification_number?: string | null
          verification_type?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_restricted: boolean
          acquisition_asked_at: string | null
          acquisition_source: string | null
          acquisition_source_other: string | null
          avatar_url: string | null
          birth_year: number | null
          complimentary_access: boolean
          complimentary_access_expires_at: string | null
          complimentary_expiry_warned_at: string | null
          consent_updated_at: string | null
          country: string
          created_at: string
          deletion_requested_at: string | null
          dietary_sensitivities_confirmed_at: string | null
          display_name: string | null
          geo_checked_at: string | null
          goals_prompt_seen_at: string | null
          hair_length_prompt_seen_at: string | null
          heritage: string[]
          home_tour_seen_at: string | null
          id: string
          international_block: boolean
          international_country: string | null
          onboarding_completed_at: string | null
          payment_required_at: string | null
          personalised_offers_answered_at: string | null
          personalised_offers_consent: boolean
          personalised_offers_prompt_count: number
          personalised_offers_prompt_seen_at: string | null
          phone_number: string | null
          photo_prompt_seen_at: string | null
          postcode: string | null
          pro_tour_seen_at: string | null
          product_prompt_seen_at: string | null
          profile_confirmed_at: string | null
          superchat_contact_id: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          tips_level: number
          tips_level_prompted_at: string | null
          topical_sensitivities_confirmed_at: string | null
          trial_offer_at: string | null
          updated_at: string
          user_id: string
          whatsapp_opt_in: boolean
          whatsapp_opt_in_at: string | null
        }
        Insert: {
          access_restricted?: boolean
          acquisition_asked_at?: string | null
          acquisition_source?: string | null
          acquisition_source_other?: string | null
          avatar_url?: string | null
          birth_year?: number | null
          complimentary_access?: boolean
          complimentary_access_expires_at?: string | null
          complimentary_expiry_warned_at?: string | null
          consent_updated_at?: string | null
          country?: string
          created_at?: string
          deletion_requested_at?: string | null
          dietary_sensitivities_confirmed_at?: string | null
          display_name?: string | null
          geo_checked_at?: string | null
          goals_prompt_seen_at?: string | null
          hair_length_prompt_seen_at?: string | null
          heritage?: string[]
          home_tour_seen_at?: string | null
          id?: string
          international_block?: boolean
          international_country?: string | null
          onboarding_completed_at?: string | null
          payment_required_at?: string | null
          personalised_offers_answered_at?: string | null
          personalised_offers_consent?: boolean
          personalised_offers_prompt_count?: number
          personalised_offers_prompt_seen_at?: string | null
          phone_number?: string | null
          photo_prompt_seen_at?: string | null
          postcode?: string | null
          pro_tour_seen_at?: string | null
          product_prompt_seen_at?: string | null
          profile_confirmed_at?: string | null
          superchat_contact_id?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tips_level?: number
          tips_level_prompted_at?: string | null
          topical_sensitivities_confirmed_at?: string | null
          trial_offer_at?: string | null
          updated_at?: string
          user_id: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Update: {
          access_restricted?: boolean
          acquisition_asked_at?: string | null
          acquisition_source?: string | null
          acquisition_source_other?: string | null
          avatar_url?: string | null
          birth_year?: number | null
          complimentary_access?: boolean
          complimentary_access_expires_at?: string | null
          complimentary_expiry_warned_at?: string | null
          consent_updated_at?: string | null
          country?: string
          created_at?: string
          deletion_requested_at?: string | null
          dietary_sensitivities_confirmed_at?: string | null
          display_name?: string | null
          geo_checked_at?: string | null
          goals_prompt_seen_at?: string | null
          hair_length_prompt_seen_at?: string | null
          heritage?: string[]
          home_tour_seen_at?: string | null
          id?: string
          international_block?: boolean
          international_country?: string | null
          onboarding_completed_at?: string | null
          payment_required_at?: string | null
          personalised_offers_answered_at?: string | null
          personalised_offers_consent?: boolean
          personalised_offers_prompt_count?: number
          personalised_offers_prompt_seen_at?: string | null
          phone_number?: string | null
          photo_prompt_seen_at?: string | null
          postcode?: string | null
          pro_tour_seen_at?: string | null
          product_prompt_seen_at?: string | null
          profile_confirmed_at?: string | null
          superchat_contact_id?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tips_level?: number
          tips_level_prompted_at?: string | null
          topical_sensitivities_confirmed_at?: string | null
          trial_offer_at?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          appointment_id: string
          audio_path: string | null
          body_text: string | null
          client_user_id: string
          created_at: string
          decided_at: string | null
          id: string
          professional_id: string
          rating: number
          status: string
          transcription_text: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          audio_path?: string | null
          body_text?: string | null
          client_user_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          professional_id: string
          rating: number
          status?: string
          transcription_text?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          audio_path?: string | null
          body_text?: string | null
          client_user_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          professional_id?: string
          rating?: number
          status?: string
          transcription_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_log: {
        Row: {
          changed_by: string | null
          created_at: string
          from_account_type: string | null
          id: string
          reason: string | null
          to_account_type: string
          user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_account_type?: string | null
          id?: string
          reason?: string | null
          to_account_type: string
          user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_account_type?: string | null
          id?: string
          reason?: string | null
          to_account_type?: string
          user_id?: string
        }
        Relationships: []
      }
      salon_members: {
        Row: {
          created_at: string
          id: string
          pro_profile_id: string | null
          role: string
          salon_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pro_profile_id?: string | null
          role?: string
          salon_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pro_profile_id?: string | null
          role?: string
          salon_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_members_pro_profile_id_fkey"
            columns: ["pro_profile_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_members_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_path: string | null
          business_email: string | null
          business_phone: string | null
          city: string | null
          cover_path: string | null
          created_at: string
          id: string
          is_published: boolean
          name: string
          opening_hours: Json | null
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          name: string
          opening_hours?: Json | null
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          name?: string
          opening_hours?: Json | null
          postcode?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scan_errors: {
        Row: {
          created_at: string
          elapsed_ms: number | null
          error_message: string | null
          error_name: string | null
          function_name: string
          id: string
          ingredient_count: number | null
          meta: Json | null
          phase: string | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          elapsed_ms?: number | null
          error_message?: string | null
          error_name?: string | null
          function_name: string
          id?: string
          ingredient_count?: number | null
          meta?: Json | null
          phase?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          elapsed_ms?: number | null
          error_message?: string | null
          error_name?: string | null
          function_name?: string
          id?: string
          ingredient_count?: number | null
          meta?: Json | null
          phase?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      scan_timings: {
        Row: {
          analysis_ms: number | null
          attempts: number | null
          cache_hit: boolean
          cpu_ms: number | null
          cpu_pct_of_limit: number | null
          created_at: string
          function_name: string
          id: string
          ingredient_count: number | null
          meta: Json | null
          ocr_ms: number | null
          retrieval_call_count: number | null
          retrieval_ms: number | null
          surface: string | null
          total_ms: number | null
          user_id: string | null
        }
        Insert: {
          analysis_ms?: number | null
          attempts?: number | null
          cache_hit?: boolean
          cpu_ms?: number | null
          cpu_pct_of_limit?: number | null
          created_at?: string
          function_name: string
          id?: string
          ingredient_count?: number | null
          meta?: Json | null
          ocr_ms?: number | null
          retrieval_call_count?: number | null
          retrieval_ms?: number | null
          surface?: string | null
          total_ms?: number | null
          user_id?: string | null
        }
        Update: {
          analysis_ms?: number | null
          attempts?: number | null
          cache_hit?: boolean
          cpu_ms?: number | null
          cpu_pct_of_limit?: number | null
          created_at?: string
          function_name?: string
          id?: string
          ingredient_count?: number | null
          meta?: Json | null
          ocr_ms?: number | null
          retrieval_call_count?: number | null
          retrieval_ms?: number | null
          surface?: string | null
          total_ms?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscription_cancellations: {
        Row: {
          account_type: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_comment: string | null
          cancellation_reason: string | null
          cancellation_source: string | null
          created_at: string
          id: string
          recorded_at: string
          stripe_customer_id: string | null
          stripe_event_key: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_comment?: string | null
          cancellation_reason?: string | null
          cancellation_source?: string | null
          created_at?: string
          id?: string
          recorded_at?: string
          stripe_customer_id?: string | null
          stripe_event_key: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_comment?: string | null
          cancellation_reason?: string | null
          cancellation_source?: string | null
          created_at?: string
          id?: string
          recorded_at?: string
          stripe_customer_id?: string | null
          stripe_event_key?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tip_evidence_sets: {
        Row: {
          attempts: number
          chapters: number[]
          claim_sources: Json
          clarification_governed: boolean
          clarifications: Json
          coverage: string
          coverage_reason: string | null
          created_at: string
          evidence: Json
          external_claims: Json
          function_name: string
          governing_principle: string | null
          id: string
          member_facts: Json
          policy: string
          stage1_tokens: number
          stage2_tokens: number
          surface: string
          tip: Json | null
          user_id: string | null
          verified: boolean
          verify_tokens: number
        }
        Insert: {
          attempts?: number
          chapters?: number[]
          claim_sources?: Json
          clarification_governed?: boolean
          clarifications?: Json
          coverage?: string
          coverage_reason?: string | null
          created_at?: string
          evidence?: Json
          external_claims?: Json
          function_name: string
          governing_principle?: string | null
          id?: string
          member_facts?: Json
          policy?: string
          stage1_tokens?: number
          stage2_tokens?: number
          surface: string
          tip?: Json | null
          user_id?: string | null
          verified?: boolean
          verify_tokens?: number
        }
        Update: {
          attempts?: number
          chapters?: number[]
          claim_sources?: Json
          clarification_governed?: boolean
          clarifications?: Json
          coverage?: string
          coverage_reason?: string | null
          created_at?: string
          evidence?: Json
          external_claims?: Json
          function_name?: string
          governing_principle?: string | null
          id?: string
          member_facts?: Json
          policy?: string
          stage1_tokens?: number
          stage2_tokens?: number
          surface?: string
          tip?: Json | null
          user_id?: string | null
          verified?: boolean
          verify_tokens?: number
        }
        Relationships: []
      }
      tip_generation_rejections: {
        Row: {
          attempt: number
          created_at: string
          detail: string | null
          evidence_set_id: string | null
          function_name: string
          id: string
          offending_text: string | null
          rule: string
          stage: string
          surface: string | null
          user_id: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          detail?: string | null
          evidence_set_id?: string | null
          function_name: string
          id?: string
          offending_text?: string | null
          rule: string
          stage: string
          surface?: string | null
          user_id?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          detail?: string | null
          evidence_set_id?: string | null
          function_name?: string
          id?: string
          offending_text?: string | null
          rule?: string
          stage?: string
          surface?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_generation_rejections_evidence_set_id_fkey"
            columns: ["evidence_set_id"]
            isOneToOne: false
            referencedRelation: "tip_evidence_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_assignments: {
        Row: {
          accepted_at: string | null
          assigner_type: Database["public"]["Enums"]["treatment_assigner_type"]
          assigner_user_id: string
          client_user_id: string | null
          created_at: string
          declined_at: string | null
          id: string
          invited_email: string | null
          media_consent_granted_at: string | null
          media_consent_revoked_at: string | null
          media_sharing_consent: boolean
          plan_consent_granted_at: string | null
          plan_id: string | null
          professional_id: string | null
          status: Database["public"]["Enums"]["treatment_assignment_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigner_type: Database["public"]["Enums"]["treatment_assigner_type"]
          assigner_user_id: string
          client_user_id?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          invited_email?: string | null
          media_consent_granted_at?: string | null
          media_consent_revoked_at?: string | null
          media_sharing_consent?: boolean
          plan_consent_granted_at?: string | null
          plan_id?: string | null
          professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_assignment_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigner_type?: Database["public"]["Enums"]["treatment_assigner_type"]
          assigner_user_id?: string
          client_user_id?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          invited_email?: string | null
          media_consent_granted_at?: string | null
          media_consent_revoked_at?: string | null
          media_sharing_consent?: boolean
          plan_consent_granted_at?: string | null
          plan_id?: string | null
          professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_assignment_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_checkin_comments: {
        Row: {
          body: string
          chat_message_id: string | null
          checkin_id: string
          created_at: string
          id: string
          professional_id: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          chat_message_id?: string | null
          checkin_id: string
          created_at?: string
          id?: string
          professional_id: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          chat_message_id?: string | null
          checkin_id?: string
          created_at?: string
          id?: string
          professional_id?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_checkin_comments_chat_message_id_fkey"
            columns: ["chat_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_checkin_comments_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_checkin_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_checkins: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          ratings: Json
          submitted_at: string | null
          updated_at: string
          user_id: string
          week_end_date: string
          week_number: number
          week_start_date: string
          written_note: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          ratings?: Json
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          week_end_date: string
          week_number: number
          week_start_date: string
          written_note?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          ratings?: Json
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          week_end_date?: string
          week_number?: number
          week_start_date?: string
          written_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_checkins_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_entries: {
        Row: {
          completed_at: string | null
          created_at: string
          entry_date: string
          id: string
          note: string | null
          plan_id: string
          schedule_id: string
          status: Database["public"]["Enums"]["treatment_entry_status"]
          time_of_day: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          entry_date: string
          id?: string
          note?: string | null
          plan_id: string
          schedule_id: string
          status?: Database["public"]["Enums"]["treatment_entry_status"]
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          plan_id?: string
          schedule_id?: string
          status?: Database["public"]["Enums"]["treatment_entry_status"]
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_entries_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_entries_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_media: {
        Row: {
          caption: string | null
          captured_at: string
          checkin_id: string | null
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number
          id: string
          media_type: Database["public"]["Enums"]["treatment_media_type"]
          milestone_id: string | null
          mime_type: string
          plan_id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          captured_at?: string
          checkin_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes: number
          id?: string
          media_type: Database["public"]["Enums"]["treatment_media_type"]
          milestone_id?: string | null
          mime_type: string
          plan_id: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          captured_at?: string
          checkin_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number
          id?: string
          media_type?: Database["public"]["Enums"]["treatment_media_type"]
          milestone_id?: string | null
          mime_type?: string
          plan_id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_media_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_media_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_media_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          label: string
          media_id: string | null
          plan_id: string
          prompt: string | null
          updated_at: string
          week_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label: string
          media_id?: string | null
          plan_id: string
          prompt?: string | null
          updated_at?: string
          week_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          label?: string
          media_id?: string | null
          plan_id?: string
          prompt?: string | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_milestones_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_milestones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_products: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          image_url: string | null
          ingredient_id: string | null
          plan_id: string
          product_name: string
          step_order: number
          storage_path: string | null
          updated_at: string
          usage_notes: string | null
          user_product_id: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          ingredient_id?: string | null
          plan_id: string
          product_name: string
          step_order?: number
          storage_path?: string | null
          updated_at?: string
          usage_notes?: string | null
          user_product_id?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          ingredient_id?: string | null
          plan_id?: string
          product_name?: string
          step_order?: number
          storage_path?: string | null
          updated_at?: string
          usage_notes?: string | null
          user_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_products_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "glossary_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_products_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_products_user_product_id_fkey"
            columns: ["user_product_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_professional_tags: {
        Row: {
          created_at: string
          id: string
          label: string | null
          plan_id: string
          professional_id: string
          tagged_by_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          plan_id: string
          professional_id: string
          tagged_by_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          plan_id?: string
          professional_id?: string
          tagged_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_professional_tags_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_schedule: {
        Row: {
          cadence: Database["public"]["Enums"]["treatment_cadence"]
          created_at: string
          days_of_week: number[] | null
          end_week: number | null
          id: string
          instructions: string | null
          plan_id: string
          product_id: string | null
          start_week: number | null
          step_order: number
          task_name: string
          time_of_day: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at: string
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["treatment_cadence"]
          created_at?: string
          days_of_week?: number[] | null
          end_week?: number | null
          id?: string
          instructions?: string | null
          plan_id: string
          product_id?: string | null
          start_week?: number | null
          step_order?: number
          task_name: string
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["treatment_cadence"]
          created_at?: string
          days_of_week?: number[] | null
          end_week?: number | null
          id?: string
          instructions?: string | null
          plan_id?: string
          product_id?: string | null
          start_week?: number | null
          step_order?: number
          task_name?: string
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_schedule_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_schedule_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_products"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_shares: {
        Row: {
          created_at: string
          id: string
          invited_email: string | null
          invited_name: string | null
          media_revoked_at: string | null
          owner_user_id: string
          plan_id: string
          professional_user_id: string | null
          responded_at: string | null
          share_media: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_email?: string | null
          invited_name?: string | null
          media_revoked_at?: string | null
          owner_user_id: string
          plan_id: string
          professional_user_id?: string | null
          responded_at?: string | null
          share_media?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_email?: string | null
          invited_name?: string | null
          media_revoked_at?: string | null
          owner_user_id?: string
          plan_id?: string
          professional_user_id?: string | null
          responded_at?: string | null
          share_media?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_shares_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_template_steps: {
        Row: {
          cadence: Database["public"]["Enums"]["treatment_cadence"]
          created_at: string
          days_of_week: number[]
          id: string
          instructions: string | null
          step_order: number
          task_name: string
          template_id: string
          time_of_day: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at: string
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["treatment_cadence"]
          created_at?: string
          days_of_week?: number[]
          id?: string
          instructions?: string | null
          step_order?: number
          task_name: string
          template_id: string
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["treatment_cadence"]
          created_at?: string
          days_of_week?: number[]
          id?: string
          instructions?: string | null
          step_order?: number
          task_name?: string
          template_id?: string
          time_of_day?: Database["public"]["Enums"]["treatment_time_of_day"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_templates: {
        Row: {
          created_at: string
          description: string | null
          duration_weeks: number
          id: string
          is_archived: boolean
          milestone_weeks: number[]
          owner_type: Database["public"]["Enums"]["treatment_assigner_type"]
          owner_user_id: string
          photo_milestone_weeks: number[]
          professional_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_weeks?: number
          id?: string
          is_archived?: boolean
          milestone_weeks?: number[]
          owner_type: Database["public"]["Enums"]["treatment_assigner_type"]
          owner_user_id: string
          photo_milestone_weeks?: number[]
          professional_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_weeks?: number
          id?: string
          is_archived?: boolean
          milestone_weeks?: number[]
          owner_type?: Database["public"]["Enums"]["treatment_assigner_type"]
          owner_user_id?: string
          photo_milestone_weeks?: number[]
          professional_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      treatment_plans: {
        Row: {
          checkin_every_weeks: number
          created_at: string
          created_by_user_id: string
          duration_unit: string
          duration_value: number | null
          duration_weeks: number
          end_date: string | null
          goal: string | null
          id: string
          notes: string | null
          paused_at: string | null
          paused_reason: string | null
          professional_id: string | null
          reminder_frequency: string
          reminder_hour: number
          reminder_timezone: string
          reminder_weekday: number
          source_template_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_every_weeks?: number
          created_at?: string
          created_by_user_id: string
          duration_unit?: string
          duration_value?: number | null
          duration_weeks?: number
          end_date?: string | null
          goal?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          professional_id?: string | null
          reminder_frequency?: string
          reminder_hour?: number
          reminder_timezone?: string
          reminder_weekday?: number
          source_template_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_every_weeks?: number
          created_at?: string
          created_by_user_id?: string
          duration_unit?: string
          duration_value?: number | null
          duration_weeks?: number
          end_date?: string | null
          goal?: string | null
          id?: string
          notes?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          professional_id?: string | null
          reminder_frequency?: string
          reminder_hour?: number
          reminder_timezone?: string
          reminder_weekday?: number
          source_template_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_advice_ledger: {
        Row: {
          action_key: string
          created_at: string
          headline: string | null
          id: string
          surface: string
          user_id: string
        }
        Insert: {
          action_key: string
          created_at?: string
          headline?: string | null
          id?: string
          surface: string
          user_id: string
        }
        Update: {
          action_key?: string
          created_at?: string
          headline?: string | null
          id?: string
          surface?: string
          user_id?: string
        }
        Relationships: []
      }
      user_before_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_challenges: {
        Row: {
          created_at: string
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          consent_key: string
          document_version: string | null
          granted: boolean
          granted_at: string
          id: string
          ip_address: string | null
          source: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_key: string
          document_version?: string | null
          granted: boolean
          granted_at?: string
          id?: string
          ip_address?: string | null
          source?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_key?: string
          document_version?: string | null
          granted?: boolean
          granted_at?: string
          id?: string
          ip_address?: string | null
          source?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          challenge: string | null
          challenge_voice_url: string | null
          challenges: string[]
          created_at: string
          current_value: number
          ended_at: string | null
          id: string
          kind: string
          notes: string | null
          start_value: number
          started_at: string | null
          status: string
          target_date: string | null
          target_text: string | null
          target_value: number | null
          target_voice_url: string | null
          title: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge?: string | null
          challenge_voice_url?: string | null
          challenges?: string[]
          created_at?: string
          current_value?: number
          ended_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
          started_at?: string | null
          status?: string
          target_date?: string | null
          target_text?: string | null
          target_value?: number | null
          target_voice_url?: string | null
          title: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge?: string | null
          challenge_voice_url?: string | null
          challenges?: string[]
          created_at?: string
          current_value?: number
          ended_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
          started_at?: string | null
          status?: string
          target_date?: string | null
          target_text?: string | null
          target_value?: number | null
          target_voice_url?: string | null
          title?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_hair_profile: {
        Row: {
          areas_of_concern: string[]
          created_at: string
          curl_pattern: string | null
          density: string | null
          diagnosed_conditions_enc: string | null
          diameter: string | null
          elasticity: string | null
          id: string
          length_bucket: string | null
          length_inches: number | null
          porosity: string | null
          scalp_condition_enc: string | null
          surface_texture: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          areas_of_concern?: string[]
          created_at?: string
          curl_pattern?: string | null
          density?: string | null
          diagnosed_conditions_enc?: string | null
          diameter?: string | null
          elasticity?: string | null
          id?: string
          length_bucket?: string | null
          length_inches?: number | null
          porosity?: string | null
          scalp_condition_enc?: string | null
          surface_texture?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          areas_of_concern?: string[]
          created_at?: string
          curl_pattern?: string | null
          density?: string | null
          diagnosed_conditions_enc?: string | null
          diameter?: string | null
          elasticity?: string | null
          id?: string
          length_bucket?: string | null
          length_inches?: number | null
          porosity?: string | null
          scalp_condition_enc?: string | null
          surface_texture?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_health_profile: {
        Row: {
          alcohol: string | null
          contraception_enc: string | null
          created_at: string
          daily_water: string | null
          diet: string | null
          diet_balance: string | null
          diet_other: string | null
          exercise: string | null
          id: string
          life_stage_enc: string | null
          medical_conditions_enc: string | null
          sleep_quality: string | null
          smoke: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alcohol?: string | null
          contraception_enc?: string | null
          created_at?: string
          daily_water?: string | null
          diet?: string | null
          diet_balance?: string | null
          diet_other?: string | null
          exercise?: string | null
          id?: string
          life_stage_enc?: string | null
          medical_conditions_enc?: string | null
          sleep_quality?: string | null
          smoke?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alcohol?: string | null
          contraception_enc?: string | null
          created_at?: string
          daily_water?: string | null
          diet?: string | null
          diet_balance?: string | null
          diet_other?: string | null
          exercise?: string | null
          id?: string
          life_stage_enc?: string | null
          medical_conditions_enc?: string | null
          sleep_quality?: string | null
          smoke?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_medications: {
        Row: {
          category: string | null
          category_enc: string | null
          created_at: string
          id: string
          name: string
          name_enc: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          category_enc?: string | null
          created_at?: string
          id?: string
          name: string
          name_enc?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          category_enc?: string | null
          created_at?: string
          id?: string
          name?: string
          name_enc?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_milestone_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          storage_path: string
          taken_on: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path: string
          taken_on?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          taken_on?: string
          user_id?: string
        }
        Relationships: []
      }
      user_product_photos: {
        Row: {
          created_at: string
          id: string
          product_brand: string | null
          product_key: string
          product_name: string | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_brand?: string | null
          product_key: string
          product_name?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_brand?: string | null
          product_key?: string
          product_name?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_products: {
        Row: {
          added_to_shelf_at: string | null
          ai_summary: string | null
          analysis_generated_at: string | null
          analysis_ingredients_hash: string | null
          analysis_profile_snapshot_hash: string | null
          application_area: string
          brand: string | null
          category: string | null
          created_at: string
          homemade_recipe: Json | null
          id: string
          image_url: string | null
          ingredients: string[]
          ingredients_captured_at: string | null
          ingredients_provenance: string | null
          ingredients_source: string | null
          is_homemade: boolean
          key_ingredients: Json
          last_used_at: string | null
          leave_on: boolean | null
          linked_brand_offer_id: string | null
          linked_brand_product_id: string | null
          marketed_purpose:
            | Database["public"]["Enums"]["product_marketed_purpose"]
            | null
          marketed_purpose_confidence: string | null
          marketed_purpose_note: string | null
          match_score: number | null
          match_score_computed_at: string | null
          name: string
          off_shelf_reason: string | null
          off_shelf_voice_url: string | null
          on_favourite: boolean
          on_shelf: boolean
          on_wishlist: boolean
          previously_on_shelf: boolean
          product_key: string
          rating: number | null
          score_reasons: Json
          source_url: string | null
          storage_path: string | null
          updated_at: string
          usage_instructions: string | null
          usage_instructions_source: string | null
          use_count: number
          user_id: string
        }
        Insert: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
          analysis_generated_at?: string | null
          analysis_ingredients_hash?: string | null
          analysis_profile_snapshot_hash?: string | null
          application_area?: string
          brand?: string | null
          category?: string | null
          created_at?: string
          homemade_recipe?: Json | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          ingredients_captured_at?: string | null
          ingredients_provenance?: string | null
          ingredients_source?: string | null
          is_homemade?: boolean
          key_ingredients?: Json
          last_used_at?: string | null
          leave_on?: boolean | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          marketed_purpose?:
            | Database["public"]["Enums"]["product_marketed_purpose"]
            | null
          marketed_purpose_confidence?: string | null
          marketed_purpose_note?: string | null
          match_score?: number | null
          match_score_computed_at?: string | null
          name: string
          off_shelf_reason?: string | null
          off_shelf_voice_url?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key: string
          rating?: number | null
          score_reasons?: Json
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          usage_instructions?: string | null
          usage_instructions_source?: string | null
          use_count?: number
          user_id: string
        }
        Update: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
          analysis_generated_at?: string | null
          analysis_ingredients_hash?: string | null
          analysis_profile_snapshot_hash?: string | null
          application_area?: string
          brand?: string | null
          category?: string | null
          created_at?: string
          homemade_recipe?: Json | null
          id?: string
          image_url?: string | null
          ingredients?: string[]
          ingredients_captured_at?: string | null
          ingredients_provenance?: string | null
          ingredients_source?: string | null
          is_homemade?: boolean
          key_ingredients?: Json
          last_used_at?: string | null
          leave_on?: boolean | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          marketed_purpose?:
            | Database["public"]["Enums"]["product_marketed_purpose"]
            | null
          marketed_purpose_confidence?: string | null
          marketed_purpose_note?: string | null
          match_score?: number | null
          match_score_computed_at?: string | null
          name?: string
          off_shelf_reason?: string | null
          off_shelf_voice_url?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key?: string
          rating?: number | null
          score_reasons?: Json
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          usage_instructions?: string | null
          usage_instructions_source?: string | null
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_products_linked_brand_offer_fk"
            columns: ["linked_brand_offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_products_linked_brand_product_fk"
            columns: ["linked_brand_product_id"]
            isOneToOne: false
            referencedRelation: "brand_products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_professionals: {
        Row: {
          booking_url: string | null
          clinic: string | null
          consultation_date: string | null
          created_at: string
          directory_id: string | null
          gmc_number_enc: string | null
          id: string
          instagram_handle: string | null
          iot_number_enc: string | null
          name: string | null
          notes_audio_path: string | null
          notes_enc: string | null
          picked_from_directory: boolean
          professional_type: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          booking_url?: string | null
          clinic?: string | null
          consultation_date?: string | null
          created_at?: string
          directory_id?: string | null
          gmc_number_enc?: string | null
          id?: string
          instagram_handle?: string | null
          iot_number_enc?: string | null
          name?: string | null
          notes_audio_path?: string | null
          notes_enc?: string | null
          picked_from_directory?: boolean
          professional_type?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          booking_url?: string | null
          clinic?: string | null
          consultation_date?: string | null
          created_at?: string
          directory_id?: string | null
          gmc_number_enc?: string | null
          id?: string
          instagram_handle?: string | null
          iot_number_enc?: string | null
          name?: string | null
          notes_audio_path?: string | null
          notes_enc?: string | null
          picked_from_directory?: boolean
          professional_type?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_professionals_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "professionals_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_saved_meals: {
        Row: {
          created_at: string
          cuisine: string | null
          emoji: string | null
          id: string
          ingredients: Json
          name: string
          name_key: string | null
          steps: Json
          summary: string | null
          targets: Json
          time_minutes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cuisine?: string | null
          emoji?: string | null
          id?: string
          ingredients?: Json
          name: string
          name_key?: string | null
          steps?: Json
          summary?: string | null
          targets?: Json
          time_minutes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          cuisine?: string | null
          emoji?: string | null
          id?: string
          ingredients?: Json
          name?: string
          name_key?: string | null
          steps?: Json
          summary?: string | null
          targets?: Json
          time_minutes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_sensitivities: {
        Row: {
          applies_to: Database["public"]["Enums"]["sensitivity_scope"]
          created_at: string
          entries_enc: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applies_to: Database["public"]["Enums"]["sensitivity_scope"]
          created_at?: string
          entries_enc?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["sensitivity_scope"]
          created_at?: string
          entries_enc?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          source: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          id?: string
          source?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          id?: string
          source?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_style_profile: {
        Row: {
          chemical_history: string[]
          colour_last_treated: string | null
          colour_product: string | null
          colour_reaction: boolean | null
          colour_reaction_audio_path: string | null
          colour_reaction_details: string | null
          colour_type: string | null
          created_at: string
          current_colour_status: string | null
          current_hairstyle: string | null
          current_style_extensions: boolean | null
          current_style_tension: string | null
          default_styles: string[]
          id: string
          main_photo_id: string | null
          planned_change_date: string | null
          planned_next_style: string | null
          planned_style_extensions: boolean | null
          planned_style_tension: string | null
          style_set_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chemical_history?: string[]
          colour_last_treated?: string | null
          colour_product?: string | null
          colour_reaction?: boolean | null
          colour_reaction_audio_path?: string | null
          colour_reaction_details?: string | null
          colour_type?: string | null
          created_at?: string
          current_colour_status?: string | null
          current_hairstyle?: string | null
          current_style_extensions?: boolean | null
          current_style_tension?: string | null
          default_styles?: string[]
          id?: string
          main_photo_id?: string | null
          planned_change_date?: string | null
          planned_next_style?: string | null
          planned_style_extensions?: boolean | null
          planned_style_tension?: string | null
          style_set_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chemical_history?: string[]
          colour_last_treated?: string | null
          colour_product?: string | null
          colour_reaction?: boolean | null
          colour_reaction_audio_path?: string | null
          colour_reaction_details?: string | null
          colour_type?: string | null
          created_at?: string
          current_colour_status?: string | null
          current_hairstyle?: string | null
          current_style_extensions?: boolean | null
          current_style_tension?: string | null
          default_styles?: string[]
          id?: string
          main_photo_id?: string | null
          planned_change_date?: string | null
          planned_next_style?: string | null
          planned_style_extensions?: boolean | null
          planned_style_tension?: string | null
          style_set_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_supplements: {
        Row: {
          created_at: string
          dose: string | null
          frequency: string | null
          id: string
          image_url: string | null
          name: string
          source: string
          source_url: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dose?: string | null
          frequency?: string | null
          id?: string
          image_url?: string | null
          name: string
          source?: string
          source_url?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dose?: string | null
          frequency?: string | null
          id?: string
          image_url?: string | null
          name?: string
          source?: string
          source_url?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_tools: {
        Row: {
          added_at: string
          ai_analysis: Json | null
          analysis_generated_at: string | null
          analysis_profile_snapshot_hash: string | null
          brand: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          last_used_at: string | null
          linked_brand_offer_id: string | null
          linked_brand_product_id: string | null
          match_score: number | null
          name: string
          notes: string | null
          on_favourite: boolean
          on_shelf: boolean
          on_wishlist: boolean
          rating: number | null
          source_url: string | null
          storage_path: string | null
          tool_key: string
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          added_at?: string
          ai_analysis?: Json | null
          analysis_generated_at?: string | null
          analysis_profile_snapshot_hash?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          last_used_at?: string | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          match_score?: number | null
          name: string
          notes?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          rating?: number | null
          source_url?: string | null
          storage_path?: string | null
          tool_key: string
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          added_at?: string
          ai_analysis?: Json | null
          analysis_generated_at?: string | null
          analysis_profile_snapshot_hash?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          last_used_at?: string | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          match_score?: number | null
          name?: string
          notes?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          rating?: number | null
          source_url?: string | null
          storage_path?: string | null
          tool_key?: string
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tools_linked_brand_offer_id_fkey"
            columns: ["linked_brand_offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tools_linked_brand_product_id_fkey"
            columns: ["linked_brand_product_id"]
            isOneToOne: false
            referencedRelation: "brand_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_day_favourites: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          step: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          step: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          step?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_day_favourites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_day_schedules: {
        Row: {
          completed_wash_day_id: string | null
          created_at: string
          google_calendar_answered_at: string | null
          google_calendar_asked_at: string | null
          google_calendar_state: string
          id: string
          scheduled_date: string
          scheduled_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_wash_day_id?: string | null
          created_at?: string
          google_calendar_answered_at?: string | null
          google_calendar_asked_at?: string | null
          google_calendar_state?: string
          id?: string
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_wash_day_id?: string | null
          created_at?: string
          google_calendar_answered_at?: string | null
          google_calendar_asked_at?: string | null
          google_calendar_state?: string
          id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wash_day_schedules_completed_wash_day_id_fkey"
            columns: ["completed_wash_day_id"]
            isOneToOne: false
            referencedRelation: "wash_days"
            referencedColumns: ["id"]
          },
        ]
      }
      wash_days: {
        Row: {
          ai_insight: string | null
          breakage: string | null
          created_at: string
          duration_min: number | null
          hair_feel_note: string | null
          hair_feel_voice_url: string | null
          heat_treatment: Json | null
          id: string
          media_path: string | null
          media_type: string | null
          next_wash_tip: string | null
          product_ids: string[]
          rating: number | null
          scalp_feel: string | null
          steps: Json
          stress_level: number | null
          style_after: string | null
          style_extensions: boolean | null
          style_other_note: string | null
          style_other_voice_url: string | null
          style_tension: string | null
          styling: Json | null
          updated_at: string
          user_id: string
          wash_date: string
        }
        Insert: {
          ai_insight?: string | null
          breakage?: string | null
          created_at?: string
          duration_min?: number | null
          hair_feel_note?: string | null
          hair_feel_voice_url?: string | null
          heat_treatment?: Json | null
          id?: string
          media_path?: string | null
          media_type?: string | null
          next_wash_tip?: string | null
          product_ids?: string[]
          rating?: number | null
          scalp_feel?: string | null
          steps?: Json
          stress_level?: number | null
          style_after?: string | null
          style_extensions?: boolean | null
          style_other_note?: string | null
          style_other_voice_url?: string | null
          style_tension?: string | null
          styling?: Json | null
          updated_at?: string
          user_id: string
          wash_date?: string
        }
        Update: {
          ai_insight?: string | null
          breakage?: string | null
          created_at?: string
          duration_min?: number | null
          hair_feel_note?: string | null
          hair_feel_voice_url?: string | null
          heat_treatment?: Json | null
          id?: string
          media_path?: string | null
          media_type?: string | null
          next_wash_tip?: string | null
          product_ids?: string[]
          rating?: number | null
          scalp_feel?: string | null
          steps?: Json
          stress_level?: number | null
          style_after?: string | null
          style_extensions?: boolean | null
          style_other_note?: string | null
          style_other_voice_url?: string | null
          style_tension?: string | null
          styling?: Json | null
          updated_at?: string
          user_id?: string
          wash_date?: string
        }
        Relationships: []
      }
      welcome_voicenote: {
        Row: {
          audio_path: string
          duration_ms: number | null
          id: string
          transcript: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          audio_path: string
          duration_ms?: number | null
          id?: string
          transcript?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          audio_path?: string
          duration_ms?: number | null
          id?: string
          transcript?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
    }
    Views: {
      ad_stats_unified: {
        Row: {
          code_copies: number | null
          expands: number | null
          impressions: number | null
          link_clicks: number | null
          matched_impressions: number | null
          matched_link_clicks: number | null
          offer_id: string | null
          raw_views: number | null
          slot: string | null
          stat_date: string | null
          wishlist_adds: number | null
        }
        Relationships: []
      }
      ai_call_costs: {
        Row: {
          attempt_number: number | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          error_text: string | null
          function_name: string | null
          generation_id: string | null
          http_status: number | null
          id: string | null
          impersonated_by: string | null
          input_tokens: number | null
          is_impersonated: boolean | null
          max_attempts: number | null
          model: string | null
          model_called: boolean | null
          outcome: string | null
          output_tokens: number | null
          provider: string | null
          rejection_rule: string | null
          retry_reason: string | null
          stage: number | null
          surface: string | null
          user_id: string | null
        }
        Relationships: []
      }
      brand_offer_stats: {
        Row: {
          code_copies: number | null
          expands: number | null
          impressions: number | null
          link_clicks: number | null
          matched_impressions: number | null
          matched_link_clicks: number | null
          offer_id: string | null
          raw_views: number | null
          slot: string | null
          stat_date: string | null
          wishlist_adds: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_enquiry: { Args: { _enquiry_id: string }; Returns: string }
      accept_treatment_assignment: {
        Args: { _assignment_id: string }
        Returns: string
      }
      account_type_of: { Args: { _user_id: string }; Returns: string }
      ad_audience_floor: { Args: never; Returns: number }
      ad_delivery_for_slot: {
        Args: { _slot: string }
        Returns: {
          match_reason: string[]
          offer_id: string
          was_matched: boolean
        }[]
      }
      ad_dismiss_offer: { Args: { _offer_id: string }; Returns: undefined }
      ad_estimate_reach: {
        Args: { _rules: Json }
        Returns: {
          audience_floor: number
          meets_floor: boolean
          reach: number
        }[]
      }
      ad_goal_focus_code: { Args: { _kind: string }; Returns: string }
      ad_match_users: {
        Args: { _rules: Json }
        Returns: {
          match_reason: string[]
          user_id: string
        }[]
      }
      ad_member_attribute_codes: {
        Args: { _user_id: string }
        Returns: {
          attribute_key: string
          value_code: string
        }[]
      }
      ad_offer_reach: {
        Args: { _offer_id: string }
        Returns: {
          audience_floor: number
          is_targeted: boolean
          meets_floor: boolean
          reach: number
        }[]
      }
      ad_offer_reportable: { Args: { _offer_id: string }; Returns: boolean }
      ad_offer_rules: { Args: { _offer_id: string }; Returns: Json }
      ad_slot_daily_rate: {
        Args: {
          _slot: Database["public"]["Enums"]["brand_placement_slot"]
          _targeted: boolean
        }
        Returns: number
      }
      ad_style_code: { Args: { _style: string }; Returns: string }
      admin_account_deletion_history: {
        Args: { _user_id: string }
        Returns: {
          action: string
          created_at: string
          erase_on: string
          id: string
          performed_by: string
          performed_by_name: string
          reason: string
        }[]
      }
      admin_broadcast_message: {
        Args: {
          _audience: string
          _body: string
          _image_path?: string
          _voice_duration_ms?: number
          _voice_path?: string
          _voice_transcript?: string
        }
        Returns: Json
      }
      admin_event_rsvps: {
        Args: { _event_id: string }
        Returns: {
          cancelled_at: string
          created_at: string
          display_name: string
          email: string
          user_id: string
        }[]
      }
      admin_list_member_activity: {
        Args: never
        Returns: {
          created_at: string
          last_session: string
          session_count: number
          sessions_last_30d: number
          user_id: string
        }[]
      }
      admin_list_member_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      admin_list_pro_usage: {
        Args: never
        Returns: {
          access_restricted: boolean
          active_clients: number
          application_created_at: string
          application_status: string
          appointments_total: number
          appointments_upcoming: number
          complimentary_access: boolean
          contact_email: string
          created_at: string
          discipline: string
          display_name: string
          email: string
          enquiries_accepted: number
          enquiries_declined: number
          enquiries_pending: number
          enquiries_total: number
          is_published: boolean
          last_session: string
          offers_live: number
          session_count: number
          sessions_last_30d: number
          sub_cancel_at_period_end: boolean
          sub_current_period_end: string
          sub_status: string
          suspended_at: string
          user_id: string
          views_last_30d: number
        }[]
      }
      admin_notifications_mark_entity_read: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: undefined
      }
      admin_notifications_mark_read: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      admin_override_brand_offer: {
        Args: {
          _ends_on?: string
          _offer_id: string
          _slots?: Database["public"]["Enums"]["brand_placement_slot"][]
          _starts_on?: string
          _targeting?: Json
        }
        Returns: Json
      }
      admin_pro_usage_detail: { Args: { _pro: string }; Returns: Json }
      admin_professional_options: { Args: never; Returns: Json }
      admin_restrict_user: { Args: { _user_id: string }; Returns: undefined }
      admin_role_history: {
        Args: { _user_id: string }
        Returns: {
          changed_by: string
          changed_by_name: string
          created_at: string
          from_account_type: string
          id: string
          reason: string
          to_account_type: string
        }[]
      }
      admin_set_account_type: {
        Args: { _account_type: string; _reason?: string; _user_id: string }
        Returns: string
      }
      admin_start_support_thread:
        | { Args: { _subject_user: string }; Returns: string }
        | {
            Args: { _subject_role?: string; _subject_user: string }
            Returns: string
          }
      admin_tip_coverage_distribution: {
        Args: { _days?: number }
        Returns: {
          explicit_count: number
          extension_count: number
          flagged: boolean
          supplement_count: number
          supplement_pct: number
          surface: string
          total: number
        }[]
      }
      admin_treatment_plans: { Args: never; Returns: Json }
      admin_unrestrict_user: { Args: { _user_id: string }; Returns: undefined }
      apply_brand_offer_revision_targeting: {
        Args: { _revision_id: string }
        Returns: undefined
      }
      approve_brand_offer_revision: {
        Args: { _revision_id: string }
        Returns: undefined
      }
      approve_pro_application: {
        Args: { _admin_notes?: string; _application_id: string }
        Returns: string
      }
      assign_treatment_template: {
        Args: {
          _client_user_id?: string
          _invited_email?: string
          _template_id: string
        }
        Returns: string
      }
      brand_catalogue_items: {
        Args: { _kind?: string; _limit?: number; _search?: string }
        Returns: {
          brand: string
          category: string
          image_url: string
          ingredients: string[]
          key_features: string[]
          kind: string
          materials: string[]
          name: string
          source_id: string
          source_url: string
          tool_kind: string
          user_count: number
        }[]
      }
      brand_count_min_threshold: { Args: never; Returns: number }
      brand_offer_interest_counts: {
        Args: { _offer_ids: string[] }
        Returns: {
          offer_id: string
          total: number
          unread: number
        }[]
      }
      brand_offer_metrics: {
        Args: { _offer_ids: string[] }
        Returns: {
          changed_at: string
          code_copies: number
          expands: number
          interactors: number
          link_clicks: number
          offer_id: string
          phase: string
          raw_views: number
          reach: number
          wishlist_adds: number
        }[]
      }
      brand_offer_split_totals: {
        Args: { _offer_id: string }
        Returns: {
          changed_at: string
          code_copies: number
          expands: number
          impressions: number
          link_clicks: number
          phase: string
          raw_views: number
          wishlist_adds: number
        }[]
      }
      brand_offer_totals: {
        Args: { _offer_ids: string[] }
        Returns: {
          code_copies: number
          expands: number
          impressions: number
          link_clicks: number
          offer_id: string
          raw_views: number
          wishlist_adds: number
        }[]
      }
      brand_paid_access: { Args: { _user: string }; Returns: boolean }
      brand_product_match_index: {
        Args: never
        Returns: {
          brand_name: string
          brand_user_id: string
          id: string
          kind: string
          name: string
        }[]
      }
      brand_product_member_counts: {
        Args: { _brand_user_id?: string }
        Returns: {
          brand_product_id: string
          favourite_count: number
          min_threshold: number
          name: string
          shelf_count: number
          suppressed: boolean
          wishlist_count: number
        }[]
      }
      brand_public_catalogue: {
        Args: { _brand_user_id: string }
        Returns: {
          brand: string
          brand_product_id: string
          category: string
          image_url: string
          kind: string
          member_count: number
          name: string
          offer_id: string
          source_url: string
          storage_path: string
          viewer_item_id: string
          viewer_on_favourite: boolean
          viewer_on_shelf: boolean
          viewer_on_wishlist: boolean
          viewer_previously_on_shelf: boolean
        }[]
      }
      brand_shelf_engagement: {
        Args: { _brand_user_id?: string }
        Returns: {
          brand_product_id: string
          code_copies: number
          expands: number
          favourite_count: number
          link_clicks: number
          min_threshold: number
          name: string
          shelf_count: number
          suppressed: boolean
          wishlist_count: number
        }[]
      }
      brand_shelf_products: {
        Args: { _brand_user_id: string }
        Returns: {
          description: string
          external_url: string
          id: string
          image_urls: string[]
          ingredients: string[]
          ingredients_source: string
          key_features: string[]
          kind: string
          materials: string[]
          name: string
          sort_position: number
          tool_kind: string
        }[]
      }
      brand_tag_options: { Args: never; Returns: Json }
      brand_tag_target_owner: {
        Args: { _taggable_id: string; _taggable_type: string }
        Returns: string
      }
      brand_tags_for: {
        Args: { _taggable_id: string; _taggable_type: string }
        Returns: Json
      }
      brand_taken_placements: {
        Args: never
        Returns: {
          ends_on: string
          headline: string
          is_mine: boolean
          offer_id: string
          owner_display_name: string
          owner_type: string
          placement_date: string
          slot: Database["public"]["Enums"]["brand_placement_slot"]
          starts_on: string
          status: Database["public"]["Enums"]["brand_offer_status"]
        }[]
      }
      campaign_owner_access: {
        Args: { _owner_type: string; _user: string }
        Returns: boolean
      }
      can_manage_pro_profile: {
        Args: { _profile_id: string; _user_id?: string }
        Returns: boolean
      }
      can_manage_salon_roster: {
        Args: { _salon_id: string; _user_id?: string }
        Returns: boolean
      }
      can_send_chat_message: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_chat_message: {
        Args: { _message_id: string; _user_id: string }
        Returns: boolean
      }
      can_write_consumer_onboarding: {
        Args: { _user: string }
        Returns: boolean
      }
      can_write_consumer_prepaywall: {
        Args: { _user: string }
        Returns: boolean
      }
      chat_book_appointment: {
        Args: {
          _appointment_date: string
          _appointment_time: string
          _location: string
          _notes: string
          _thread_id: string
        }
        Returns: string
      }
      claim_my_treatment_invites: { Args: never; Returns: number }
      claim_my_treatment_shares: { Args: never; Returns: number }
      confirm_brand_offer_revision_payment: {
        Args: {
          _payment_intent_id: string
          _revision_id: string
          _session_id: string
        }
        Returns: boolean
      }
      decline_treatment_assignment: {
        Args: { _assignment_id: string }
        Returns: undefined
      }
      ensure_treatment_checkin_notification: {
        Args: { _plan_id: string; _week: number }
        Returns: string
      }
      expire_unpaid_brand_offer_revisions: { Args: never; Returns: number }
      forum_author_info: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          first_name: string
          user_id: string
        }[]
      }
      forum_author_meta: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          city: string
          current_style: string
          display_name: string
          goal_title: string
          hair_type: string
          user_id: string
        }[]
      }
      forum_mention_search: {
        Args: { _limit?: number; _query: string; _thread_id: string }
        Returns: {
          avatar_url: string
          entity_id: string
          in_thread: boolean
          kind: string
          label: string
          subtitle: string
        }[]
      }
      forum_search_plus_members: {
        Args: { _limit?: number; _query: string }
        Returns: {
          avatar_url: string
          display_name: string
          user_id: string
        }[]
      }
      has_accepted_plan_access: {
        Args: { _plan_id: string; _pro?: string }
        Returns: boolean
      }
      has_active_brand_subscription: {
        Args: { _user: string }
        Returns: boolean
      }
      has_active_client_access: {
        Args: { _consumer: string; _pro: string }
        Returns: boolean
      }
      has_active_consumer_subscription: {
        Args: { _user: string }
        Returns: boolean
      }
      has_active_plus_subscription: {
        Args: { _user: string }
        Returns: boolean
      }
      has_active_pro_subscription: { Args: { _pro: string }; Returns: boolean }
      has_active_promotion_eligibility: {
        Args: { _owner_type: string; _user: string }
        Returns: boolean
      }
      has_media_access: {
        Args: { _plan_id: string; _pro?: string }
        Returns: boolean
      }
      has_professional_undertaking: { Args: { _pro: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_access_restricted: { Args: { _user_id: string }; Returns: boolean }
      is_chat_participant: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      is_salon_member: {
        Args: { _salon_id: string; _user_id?: string }
        Returns: boolean
      }
      log_referral_attribution: {
        Args: {
          p_appointment_id?: string
          p_directory_id?: string
          p_enquiry_id?: string
          p_event_type: string
          p_pro_user_id?: string
        }
        Returns: undefined
      }
      manuscript_chapters: {
        Args: { chapter_numbers: number[] }
        Returns: {
          body: string
          chapter: number
          chapter_title: string
          page_end: number
          page_start: number
          section_heading: string
          token_count: number
        }[]
      }
      mark_booking_click_prompted: {
        Args: { _click_id: string }
        Returns: undefined
      }
      match_manuscript_chunks: {
        Args: {
          chapter_filter?: number[]
          match_count?: number
          query_embedding: string
        }
        Returns: {
          body: string
          chapter: number
          chapter_title: string
          page_end: number
          page_start: number
          section_heading: string
          similarity: number
        }[]
      }
      member_start_support_thread: { Args: never; Returns: string }
      mention_search_all: {
        Args: { _limit?: number; _query: string }
        Returns: {
          avatar_url: string
          entity_id: string
          kind: string
          label: string
          subtitle: string
        }[]
      }
      my_plus_status: { Args: never; Returns: boolean }
      note_booking_link_opened: {
        Args: { _thread_id: string }
        Returns: undefined
      }
      notify_admins: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _title: string
          _type: string
          _url: string
        }
        Returns: undefined
      }
      owns_treatment_plan: {
        Args: { _plan_id: string; _user: string }
        Returns: boolean
      }
      passport_treatment_plans: { Args: { _client: string }; Returns: Json }
      pause_lapsed_treatment_plans: { Args: never; Returns: number }
      personalised_offers_prompt_ack: {
        Args: { _answered?: boolean }
        Returns: undefined
      }
      pro_cancel_appointment: {
        Args: { _appointment_id: string; _reason: string }
        Returns: undefined
      }
      pro_log_appointment: {
        Args: {
          _appointment_date: string
          _appointment_time?: string
          _client_user_id: string
          _location?: string
          _notes?: string
          _service?: string
        }
        Returns: string
      }
      pro_public_reviews: {
        Args: { _limit?: number; _offset?: number; _pro: string }
        Returns: {
          audio_path: string
          body_text: string
          created_at: string
          id: string
          rating: number
          reviewer_label: string
          service: string
          transcription_text: string
        }[]
      }
      pro_review_summary: {
        Args: { _pro_ids: string[] }
        Returns: {
          avg_rating: number
          professional_id: string
          review_count: number
        }[]
      }
      pro_treatment_clients: { Args: never; Returns: Json }
      product_analysis_backfill_progress: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      purge_ad_events: { Args: never; Returns: number }
      queue_appointment_reminders: { Args: never; Returns: number }
      record_ad_event: {
        Args: {
          p_brand_product_id?: string
          p_event_type?: string
          p_match_reason?: Json
          p_offer_id?: string
          p_slot?: string
          p_unit?: string
          p_was_matched?: boolean
        }
        Returns: undefined
      }
      record_consents: {
        Args: {
          _consents: Json
          _source?: string
          _user_agent?: string
          _version: string
        }
        Returns: undefined
      }
      refresh_ad_audiences: { Args: never; Returns: number }
      reject_brand_offer_revision: {
        Args: { _reason: string; _revision_id: string }
        Returns: undefined
      }
      relaunch_brand_offer: { Args: { _offer_id: string }; Returns: string }
      resolve_ad_offer_audience: {
        Args: { _offer_id: string }
        Returns: number
      }
      resolve_booking_click: {
        Args: { _appointment_id?: string; _click_id: string; _outcome: string }
        Returns: undefined
      }
      resolve_mention_user_ids: { Args: { _text: string }; Returns: string[] }
      rollup_ad_stats: { Args: { p_from?: string }; Returns: number }
      rollup_brand_product_stats: { Args: { p_from?: string }; Returns: number }
      send_enquiry_to_profile: {
        Args: {
          _budget_range: string
          _contact_method: string
          _contact_phone: string
          _location_preference: string
          _note: string
          _preferred_timeframe: string
          _pro_profile_id: string
          _sender_role?: string
          _service_interest: string
          _share_passport_consent?: boolean
        }
        Returns: string
      }
      send_enquiry_with_access:
        | {
            Args: {
              _budget_range: string
              _contact_method: string
              _contact_phone: string
              _location_preference: string
              _note: string
              _preferred_timeframe: string
              _pro_user_id: string
              _service_interest: string
              _share_passport_consent?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              _budget_range: string
              _contact_method: string
              _contact_phone: string
              _location_preference: string
              _note: string
              _preferred_timeframe: string
              _pro_user_id: string
              _sender_role?: string
              _service_interest: string
              _share_passport_consent?: boolean
            }
            Returns: string
          }
      set_brand_blood_verification: {
        Args: { _brand_user_id: string; _verified: boolean }
        Returns: undefined
      }
      set_passport_access: {
        Args: { _grant: boolean; _pro_user_id: string }
        Returns: string
      }
      set_personalised_offers_consent: {
        Args: { _on: boolean; _source?: string }
        Returns: boolean
      }
      set_pro_capability_verification: {
        Args: {
          _approve: boolean
          _capability: string
          _note?: string
          _pro: string
        }
        Returns: undefined
      }
      set_treatment_media_consent: {
        Args: { _assignment_id: string; _on: boolean }
        Returns: undefined
      }
      start_member_dm: { Args: { _other_user: string }; Returns: string }
      strand_today_london: { Args: never; Returns: string }
      submit_brand_offer_revision: {
        Args: {
          _body_copy: string
          _discount_code: string
          _external_url: string
          _headline: string
          _hero_image_path: string
          _offer_id: string
          _products: Json
          _targeting?: Json
        }
        Returns: string
      }
      treatment_assignable_clients: { Args: never; Returns: Json }
      treatment_checkin_nudge_due: {
        Args: { _today: string }
        Returns: {
          plan_id: string
          plan_title: string
          steps_logged: number
          user_id: string
          week_end: string
          week_number: number
          week_start: string
        }[]
      }
      treatment_checkin_owner: {
        Args: { _checkin_id: string }
        Returns: string
      }
      treatment_checkin_plan: { Args: { _checkin_id: string }; Returns: string }
      treatment_client_thread: {
        Args: { _client_user_id: string }
        Returns: string
      }
      treatment_digest_for_recipient: {
        Args: { _recipient: string; _week_end: string; _week_start: string }
        Returns: Json
      }
      treatment_digest_recipients: {
        Args: never
        Returns: {
          is_admin: boolean
          user_id: string
        }[]
      }
      treatment_invitation: { Args: { _assignment_id: string }; Returns: Json }
      treatment_pro_search: { Args: { _q: string }; Returns: Json }
      treatment_reminders_due: {
        Args: { _now: string }
        Returns: {
          due_outstanding: number
          due_tasks: string[]
          frequency: string
          local_date: string
          plan_id: string
          plan_title: string
          steps_logged: number
          user_id: string
          week_end: string
          week_number: number
          week_start: string
        }[]
      }
      treatment_share_detail: { Args: { _share_id: string }; Returns: Json }
      treatment_share_respond: {
        Args: { _accept: boolean; _share_id: string }
        Returns: Json
      }
      withdraw_brand_offer_revision: {
        Args: { _revision_id: string }
        Returns: undefined
      }
      withdraw_consent: {
        Args: { _key: string; _source?: string; _version?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "consumer" | "professional" | "admin" | "brand"
      brand_offer_status:
        | "draft"
        | "under_review"
        | "approved_unpaid"
        | "paid_scheduled"
        | "live"
        | "ended"
        | "rejected"
        | "cancelled"
      brand_placement_slot: "home" | "products" | "wash_day" | "pro_welcome"
      brand_tag_type: "editorial" | "promoted"
      pro_application_status: "pending" | "approved" | "rejected" | "suspended"
      pro_discipline:
        | "Trichologist"
        | "Dermatologist"
        | "Curl Specialist"
        | "Colourist"
        | "Stylist"
      pro_enquiry_status: "pending" | "accepted" | "declined" | "withdrawn"
      pro_listing_tier: "full" | "listed_enquiry" | "external_link"
      pro_profile_review_status:
        | "draft"
        | "submitted"
        | "approved"
        | "changes_requested"
      pro_type: "Trichologist" | "Dermatologist" | "Curl Specialist"
      product_marketed_purpose:
        | "dry_hair"
        | "damaged_hair"
        | "colour_treated"
        | "greasy_oily"
        | "general_all_hair_types"
        | "moisture"
        | "repair"
        | "clarifying"
        | "density_growth"
        | "scalp_health"
      sensitivity_scope: "topical" | "dietary"
      treatment_assigner_type: "professional" | "admin"
      treatment_assignment_status:
        | "pending"
        | "accepted"
        | "declined"
        | "revoked"
      treatment_cadence: "daily" | "specific_days" | "weekly"
      treatment_entry_status: "completed" | "skipped"
      treatment_media_type: "photo" | "video" | "audio"
      treatment_plan_status:
        | "draft"
        | "active"
        | "paused"
        | "completed"
        | "abandoned"
      treatment_time_of_day: "morning" | "evening" | "both"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["consumer", "professional", "admin", "brand"],
      brand_offer_status: [
        "draft",
        "under_review",
        "approved_unpaid",
        "paid_scheduled",
        "live",
        "ended",
        "rejected",
        "cancelled",
      ],
      brand_placement_slot: ["home", "products", "wash_day", "pro_welcome"],
      brand_tag_type: ["editorial", "promoted"],
      pro_application_status: ["pending", "approved", "rejected", "suspended"],
      pro_discipline: [
        "Trichologist",
        "Dermatologist",
        "Curl Specialist",
        "Colourist",
        "Stylist",
      ],
      pro_enquiry_status: ["pending", "accepted", "declined", "withdrawn"],
      pro_listing_tier: ["full", "listed_enquiry", "external_link"],
      pro_profile_review_status: [
        "draft",
        "submitted",
        "approved",
        "changes_requested",
      ],
      pro_type: ["Trichologist", "Dermatologist", "Curl Specialist"],
      product_marketed_purpose: [
        "dry_hair",
        "damaged_hair",
        "colour_treated",
        "greasy_oily",
        "general_all_hair_types",
        "moisture",
        "repair",
        "clarifying",
        "density_growth",
        "scalp_health",
      ],
      sensitivity_scope: ["topical", "dietary"],
      treatment_assigner_type: ["professional", "admin"],
      treatment_assignment_status: [
        "pending",
        "accepted",
        "declined",
        "revoked",
      ],
      treatment_cadence: ["daily", "specific_days", "weekly"],
      treatment_entry_status: ["completed", "skipped"],
      treatment_media_type: ["photo", "video", "audio"],
      treatment_plan_status: [
        "draft",
        "active",
        "paused",
        "completed",
        "abandoned",
      ],
      treatment_time_of_day: ["morning", "evening", "both"],
    },
  },
} as const
