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
      blood_results: {
        Row: {
          category: string | null
          id: string
          marker: string
          status: string | null
          unit: string | null
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          category?: string | null
          id?: string
          marker: string
          status?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          category?: string | null
          id?: string
          marker?: string
          status?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
          value?: number | null
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
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          created_at: string
          current_value: number
          id: string
          kind: string
          notes: string | null
          start_value: number
          status: string
          target_date: string | null
          target_value: number
          title: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
          status?: string
          target_date?: string | null
          target_value: number
          title: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          kind?: string
          notes?: string | null
          start_value?: number
          status?: string
          target_date?: string | null
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_medications: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
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
          on_shelf: boolean
          on_wishlist: boolean
          previously_on_shelf: boolean
          product_key: string
          rating: number | null
          storage_path: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
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
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key: string
          rating?: number | null
          storage_path?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          added_to_shelf_at?: string | null
          ai_summary?: string | null
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
          on_shelf?: boolean
          on_wishlist?: boolean
          previously_on_shelf?: boolean
          product_key?: string
          rating?: number | null
          storage_path?: string | null
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
