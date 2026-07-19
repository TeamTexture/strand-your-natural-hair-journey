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
          follow_up_needed: boolean
          id: string
          notes: string | null
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
          follow_up_needed?: boolean
          id?: string
          notes?: string | null
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
          follow_up_needed?: boolean
          id?: string
          notes?: string | null
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
          label: string | null
          notes: string | null
          panel_date: string
          scheduled_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          panel_date?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          panel_date?: string
          scheduled_at?: string | null
          status?: string
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
          avatar_url: string | null
          birth_year: number | null
          country: string
          created_at: string
          display_name: string | null
          heritage: string[]
          id: string
          onboarding_completed_at: string | null
          postcode: string | null
          updated_at: string
          user_id: string
          water_hardness_band: string | null
          water_hardness_mg_l: number | null
          water_supplier: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          country?: string
          created_at?: string
          display_name?: string | null
          heritage?: string[]
          id?: string
          onboarding_completed_at?: string | null
          postcode?: string | null
          updated_at?: string
          user_id: string
          water_hardness_band?: string | null
          water_hardness_mg_l?: number | null
          water_supplier?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          country?: string
          created_at?: string
          display_name?: string | null
          heritage?: string[]
          id?: string
          onboarding_completed_at?: string | null
          postcode?: string | null
          updated_at?: string
          user_id?: string
          water_hardness_band?: string | null
          water_hardness_mg_l?: number | null
          water_supplier?: string | null
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
      user_style_profile: {
        Row: {
          chemical_history: string[]
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
        Relationships: []
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
      [_ in never]: never
    }
    Enums: {
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
      pro_type: ["Trichologist", "Dermatologist", "Curl Specialist"],
    },
  },
} as const
