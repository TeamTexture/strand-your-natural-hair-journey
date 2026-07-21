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
          clinic_name: string | null
          created_at: string
          follow_up_date: string | null
          follow_up_needed: boolean
          follow_up_time: string | null
          id: string
          linked_pro_user_id: string | null
          notes: string | null
          outcome_audio_path: string | null
          outcome_notes: string | null
          professional_name: string
          professional_type: string | null
          reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          clinic_name?: string | null
          created_at?: string
          follow_up_date?: string | null
          follow_up_needed?: boolean
          follow_up_time?: string | null
          id?: string
          linked_pro_user_id?: string | null
          notes?: string | null
          outcome_audio_path?: string | null
          outcome_notes?: string | null
          professional_name: string
          professional_type?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          clinic_name?: string | null
          created_at?: string
          follow_up_date?: string | null
          follow_up_needed?: boolean
          follow_up_time?: string | null
          id?: string
          linked_pro_user_id?: string | null
          notes?: string | null
          outcome_audio_path?: string | null
          outcome_notes?: string | null
          professional_name?: string
          professional_type?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
      brand_offer_revisions: {
        Row: {
          body_copy: string | null
          brand_user_id: string
          created_at: string
          discount_code: string | null
          external_url: string | null
          headline: string | null
          hero_image_path: string | null
          id: string
          offer_id: string
          products: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          body_copy?: string | null
          brand_user_id: string
          created_at?: string
          discount_code?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          id?: string
          offer_id: string
          products?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          body_copy?: string | null
          brand_user_id?: string
          created_at?: string
          discount_code?: string | null
          external_url?: string | null
          headline?: string | null
          hero_image_path?: string | null
          id?: string
          offer_id?: string
          products?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
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
      brand_offer_stats: {
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
      brand_offers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_copy: string | null
          brand_user_id: string
          created_at: string
          currency: string
          discount_code: string | null
          ends_on: string | null
          external_url: string | null
          headline: string
          hero_image_path: string | null
          id: string
          paid_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          submitted_at: string | null
          total_price_pence: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_copy?: string | null
          brand_user_id: string
          created_at?: string
          currency?: string
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          headline: string
          hero_image_path?: string | null
          id?: string
          paid_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          total_price_pence?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_copy?: string | null
          brand_user_id?: string
          created_at?: string
          currency?: string
          discount_code?: string | null
          ends_on?: string | null
          external_url?: string | null
          headline?: string
          hero_image_path?: string | null
          id?: string
          paid_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["brand_offer_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          total_price_pence?: number
          updated_at?: string
        }
        Relationships: []
      }
      brand_products: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          id: string
          image_urls: string[] | null
          ingredients: string[] | null
          key_features: string[]
          kind: string
          linked_product_id: string | null
          materials: string[]
          name: string
          offer_id: string
          position: number
          source_type: string
          source_url: string | null
          tool_kind: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_urls?: string[] | null
          ingredients?: string[] | null
          key_features?: string[]
          kind?: string
          linked_product_id?: string | null
          materials?: string[]
          name: string
          offer_id: string
          position?: number
          source_type: string
          source_url?: string | null
          tool_kind?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          image_urls?: string[] | null
          ingredients?: string[] | null
          key_features?: string[]
          kind?: string
          linked_product_id?: string | null
          materials?: string[]
          name?: string
          offer_id?: string
          position?: number
          source_type?: string
          source_url?: string | null
          tool_kind?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_products_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "brand_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          brand_name: string
          contact_name: string | null
          created_at: string
          id: string
          logo_path: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          brand_name: string
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          brand_name?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
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
      consumer_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          price_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
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
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          mood: string | null
          note: string | null
          photo_paths: string[]
          products_used: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          note?: string | null
          photo_paths?: string[]
          products_used?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          mood?: string | null
          note?: string | null
          photo_paths?: string[]
          products_used?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      manuscript_chunks: {
        Row: {
          body: string
          chapter: number
          chapter_title: string
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
          chapter_title: string
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
          chapter_title?: string
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
          location: string | null
          opening_hours: Json | null
          payment_confirmed_at: string | null
          postcode: string | null
          qualifications: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id: string | null
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
          location?: string | null
          opening_hours?: Json | null
          payment_confirmed_at?: string | null
          postcode?: string | null
          qualifications?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id?: string | null
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
          location?: string | null
          opening_hours?: Json | null
          payment_confirmed_at?: string | null
          postcode?: string | null
          qualifications?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["pro_application_status"]
          stripe_checkout_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
          why_strand?: string | null
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
          consumer_id: string
          created_at: string
          decline_reason: string | null
          id: string
          note: string | null
          pro_user_id: string
          responded_at: string | null
          share_passport_consent: boolean
          status: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at: string
        }
        Insert: {
          consumer_id: string
          created_at?: string
          decline_reason?: string | null
          id?: string
          note?: string | null
          pro_user_id: string
          responded_at?: string | null
          share_passport_consent?: boolean
          status?: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at?: string
        }
        Update: {
          consumer_id?: string
          created_at?: string
          decline_reason?: string | null
          id?: string
          note?: string | null
          pro_user_id?: string
          responded_at?: string | null
          share_passport_consent?: boolean
          status?: Database["public"]["Enums"]["pro_enquiry_status"]
          updated_at?: string
        }
        Relationships: []
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
      pro_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_path: string | null
          bio: string | null
          booking_url: string | null
          business_email: string | null
          business_phone: string | null
          city: string | null
          contact_email: string | null
          cover_path: string | null
          created_at: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          display_name: string
          id: string
          instagram_handle: string | null
          is_published: boolean
          location: string | null
          opening_hours: Json | null
          photos: string[]
          postcode: string | null
          services: Json
          specialisms: string[]
          suspended_at: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          bio?: string | null
          booking_url?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          contact_email?: string | null
          cover_path?: string | null
          created_at?: string
          discipline: Database["public"]["Enums"]["pro_discipline"]
          display_name: string
          id?: string
          instagram_handle?: string | null
          is_published?: boolean
          location?: string | null
          opening_hours?: Json | null
          photos?: string[]
          postcode?: string | null
          services?: Json
          specialisms?: string[]
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_path?: string | null
          bio?: string | null
          booking_url?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          contact_email?: string | null
          cover_path?: string | null
          created_at?: string
          discipline?: Database["public"]["Enums"]["pro_discipline"]
          display_name?: string
          id?: string
          instagram_handle?: string | null
          is_published?: boolean
          location?: string | null
          opening_hours?: Json | null
          photos?: string[]
          postcode?: string | null
          services?: Json
          specialisms?: string[]
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
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
          created_at: string
          discount_code: string | null
          discount_description: string | null
          id: string
          instagram_handle: string | null
          is_active: boolean
          name: string
          postcode: string | null
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
          created_at?: string
          discount_code?: string | null
          discount_description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          name: string
          postcode?: string | null
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
          created_at?: string
          discount_code?: string | null
          discount_description?: string | null
          id?: string
          instagram_handle?: string | null
          is_active?: boolean
          name?: string
          postcode?: string | null
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
          avatar_url: string | null
          birth_year: number | null
          complimentary_access: boolean
          country: string
          created_at: string
          display_name: string | null
          heritage: string[]
          id: string
          onboarding_completed_at: string | null
          postcode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_restricted?: boolean
          avatar_url?: string | null
          birth_year?: number | null
          complimentary_access?: boolean
          country?: string
          created_at?: string
          display_name?: string | null
          heritage?: string[]
          id?: string
          onboarding_completed_at?: string | null
          postcode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_restricted?: boolean
          avatar_url?: string | null
          birth_year?: number | null
          complimentary_access?: boolean
          country?: string
          created_at?: string
          display_name?: string | null
          heritage?: string[]
          id?: string
          onboarding_completed_at?: string | null
          postcode?: string | null
          updated_at?: string
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
      user_goals: {
        Row: {
          challenge: string | null
          challenge_voice_url: string | null
          created_at: string
          current_value: number
          id: string
          kind: string
          notes: string | null
          start_value: number
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
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
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
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
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
          analysis_profile_snapshot_hash: string | null
          brand: string | null
          category: string | null
          created_at: string
          id: string
          image_url: string | null
          ingredients: string[]
          key_ingredients: Json
          last_used_at: string | null
          linked_brand_offer_id: string | null
          linked_brand_product_id: string | null
          match_score: number | null
          name: string
          off_shelf_reason: string | null
          off_shelf_voice_url: string | null
          on_favourite: boolean
          on_shelf: boolean
          on_wishlist: boolean
          previously_on_shelf: boolean
          product_key: string
          rating: number | null
          source_url: string | null
          storage_path: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
          analysis_generated_at?: string | null
          analysis_profile_snapshot_hash?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          ingredients?: string[]
          key_ingredients?: Json
          last_used_at?: string | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          match_score?: number | null
          name: string
          off_shelf_reason?: string | null
          off_shelf_voice_url?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key: string
          rating?: number | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
          analysis_generated_at?: string | null
          analysis_profile_snapshot_hash?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          ingredients?: string[]
          key_ingredients?: Json
          last_used_at?: string | null
          linked_brand_offer_id?: string | null
          linked_brand_product_id?: string | null
          match_score?: number | null
          name?: string
          off_shelf_reason?: string | null
          off_shelf_voice_url?: string | null
          on_favourite?: boolean
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key?: string
          rating?: number | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
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
          steps?: Json
          summary?: string | null
          targets?: Json
          time_minutes?: number | null
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
          default_styles: string[]
          id: string
          planned_change_date: string | null
          planned_next_style: string | null
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
          default_styles?: string[]
          id?: string
          planned_change_date?: string | null
          planned_next_style?: string | null
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
          default_styles?: string[]
          id?: string
          planned_change_date?: string | null
          planned_next_style?: string | null
          style_set_at?: string | null
          updated_at?: string
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
          next_wash_tip: string | null
          product_ids: string[]
          scalp_feel: string | null
          steps: Json
          stress_level: number | null
          style_after: string | null
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
          next_wash_tip?: string | null
          product_ids?: string[]
          scalp_feel?: string | null
          steps?: Json
          stress_level?: number | null
          style_after?: string | null
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
          next_wash_tip?: string | null
          product_ids?: string[]
          scalp_feel?: string | null
          steps?: Json
          stress_level?: number | null
          style_after?: string | null
          styling?: Json | null
          updated_at?: string
          user_id?: string
          wash_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_enquiry: { Args: { _enquiry_id: string }; Returns: string }
      admin_list_member_activity: {
        Args: never
        Returns: {
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
      admin_pro_usage_detail: { Args: { _pro: string }; Returns: Json }
      admin_restrict_user: { Args: { _user_id: string }; Returns: undefined }
      admin_unrestrict_user: { Args: { _user_id: string }; Returns: undefined }
      approve_brand_offer_revision: {
        Args: { _revision_id: string }
        Returns: undefined
      }
      approve_pro_application: {
        Args: { _admin_notes?: string; _application_id: string }
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
      brand_offer_totals: {
        Args: { _offer_ids: string[] }
        Returns: {
          code_copies: number
          impressions: number
          link_clicks: number
          offer_id: string
          taps: number
          wishlist_adds: number
        }[]
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
      has_active_pro_subscription: { Args: { _pro: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_brand_offer_stat: {
        Args: {
          _kind: string
          _offer_id: string
          _slot: Database["public"]["Enums"]["brand_placement_slot"]
        }
        Returns: undefined
      }
      is_access_restricted: { Args: { _user_id: string }; Returns: boolean }
      reject_brand_offer_revision: {
        Args: { _reason: string; _revision_id: string }
        Returns: undefined
      }
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
        }
        Returns: string
      }
      withdraw_brand_offer_revision: {
        Args: { _revision_id: string }
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
      brand_placement_slot: "home" | "products" | "wash_day"
      pro_application_status: "pending" | "approved" | "rejected" | "suspended"
      pro_discipline:
        | "Trichologist"
        | "Dermatologist"
        | "Curl Specialist"
        | "Colourist"
        | "Stylist"
      pro_enquiry_status: "pending" | "accepted" | "declined" | "withdrawn"
      pro_type: "Trichologist" | "Dermatologist" | "Curl Specialist"
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
      brand_placement_slot: ["home", "products", "wash_day"],
      pro_application_status: ["pending", "approved", "rejected", "suspended"],
      pro_discipline: [
        "Trichologist",
        "Dermatologist",
        "Curl Specialist",
        "Colourist",
        "Stylist",
      ],
      pro_enquiry_status: ["pending", "accepted", "declined", "withdrawn"],
      pro_type: ["Trichologist", "Dermatologist", "Curl Specialist"],
    },
  },
} as const
