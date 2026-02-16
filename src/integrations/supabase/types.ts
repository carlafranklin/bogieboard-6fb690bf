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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      canonical_events: {
        Row: {
          age_restriction: number | null
          all_day: boolean
          created_at: string
          currency: string
          description_long: string | null
          description_short: string | null
          discount_info: string | null
          end_time: string | null
          event_series_id: string | null
          first_seen_at: string
          id: string
          image_attribution: string | null
          image_last_verified_at: string | null
          image_source: string | null
          image_url: string | null
          is_free: boolean
          last_refreshed_at: string
          last_seen_at: string
          metro_area_id: string | null
          normalized_hash: string | null
          organizer_name: string | null
          price_max: number | null
          price_min: number | null
          source_url: string | null
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          ticket_url: string | null
          title: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          age_restriction?: number | null
          all_day?: boolean
          created_at?: string
          currency?: string
          description_long?: string | null
          description_short?: string | null
          discount_info?: string | null
          end_time?: string | null
          event_series_id?: string | null
          first_seen_at?: string
          id?: string
          image_attribution?: string | null
          image_last_verified_at?: string | null
          image_source?: string | null
          image_url?: string | null
          is_free?: boolean
          last_refreshed_at?: string
          last_seen_at?: string
          metro_area_id?: string | null
          normalized_hash?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          source_url?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
          title: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          age_restriction?: number | null
          all_day?: boolean
          created_at?: string
          currency?: string
          description_long?: string | null
          description_short?: string | null
          discount_info?: string | null
          end_time?: string | null
          event_series_id?: string | null
          first_seen_at?: string
          id?: string
          image_attribution?: string | null
          image_last_verified_at?: string | null
          image_source?: string | null
          image_url?: string | null
          is_free?: boolean
          last_refreshed_at?: string
          last_seen_at?: string
          metro_area_id?: string | null
          normalized_hash?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          source_url?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["event_status"]
          ticket_url?: string | null
          title?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_events_metro_area_id_fkey"
            columns: ["metro_area_id"]
            isOneToOne: false
            referencedRelation: "metro_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_canonical_events_series"
            columns: ["event_series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          display_order: number | null
          icon: string | null
          id: string
          name: string
          parent_category_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          name: string
          parent_category_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          icon?: string | null
          id?: string
          name?: string
          parent_category_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      click_logs: {
        Row: {
          canonical_event_id: string | null
          click_type: string
          created_at: string
          id: string
          source_id: string | null
        }
        Insert: {
          canonical_event_id?: string | null
          click_type?: string
          created_at?: string
          id?: string
          source_id?: string | null
        }
        Update: {
          canonical_event_id?: string | null
          click_type?: string
          created_at?: string
          id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "click_logs_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          category_id: string
          event_id: string
        }
        Insert: {
          category_id: string
          event_id: string
        }
        Update: {
          category_id?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_categories_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          id: string
          metro_area_id: string | null
          organizer_name: string | null
          rrule: string | null
          title: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metro_area_id?: string | null
          organizer_name?: string | null
          rrule?: string | null
          title: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metro_area_id?: string | null
          organizer_name?: string | null
          rrule?: string | null
          title?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_series_metro_area_id_fkey"
            columns: ["metro_area_id"]
            isOneToOne: false
            referencedRelation: "metro_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          age_restriction: number | null
          business_user_id: string
          category_id: string | null
          city: string | null
          created_at: string
          description: string | null
          event_date: string | null
          event_time: string | null
          id: string
          image_url: string | null
          is_free: boolean | null
          price: number | null
          state: string | null
          subcategory_id: string | null
          ticket_url: string | null
          title: string
          updated_at: string
          venue: string | null
          zip_code: string | null
        }
        Insert: {
          age_restriction?: number | null
          business_user_id: string
          category_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_url?: string | null
          is_free?: boolean | null
          price?: number | null
          state?: string | null
          subcategory_id?: string | null
          ticket_url?: string | null
          title: string
          updated_at?: string
          venue?: string | null
          zip_code?: string | null
        }
        Update: {
          age_restriction?: number | null
          business_user_id?: string
          category_id?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          image_url?: string | null
          is_free?: boolean | null
          price?: number | null
          state?: string | null
          subcategory_id?: string | null
          ticket_url?: string | null
          title?: string
          updated_at?: string
          venue?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_registry: {
        Row: {
          created_at: string
          default_city: string | null
          default_state: string | null
          default_venue_name: string | null
          default_zip: string | null
          enabled: boolean
          feed_name: string
          feed_type: Database["public"]["Enums"]["feed_type"]
          feed_url: string
          id: string
          last_error: string | null
          last_fetched_at: string | null
          metro_area_slug: string
          refresh_frequency: Database["public"]["Enums"]["refresh_frequency"]
          source_category: Database["public"]["Enums"]["source_category"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_city?: string | null
          default_state?: string | null
          default_venue_name?: string | null
          default_zip?: string | null
          enabled?: boolean
          feed_name: string
          feed_type?: Database["public"]["Enums"]["feed_type"]
          feed_url: string
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          metro_area_slug: string
          refresh_frequency?: Database["public"]["Enums"]["refresh_frequency"]
          source_category?: Database["public"]["Enums"]["source_category"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_city?: string | null
          default_state?: string | null
          default_venue_name?: string | null
          default_zip?: string | null
          enabled?: boolean
          feed_name?: string
          feed_type?: Database["public"]["Enums"]["feed_type"]
          feed_url?: string
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          metro_area_slug?: string
          refresh_frequency?: Database["public"]["Enums"]["refresh_frequency"]
          source_category?: Database["public"]["Enums"]["source_category"]
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_errors: {
        Row: {
          created_at: string
          error_type: string
          event_source_url: string | null
          id: string
          ingestion_run_id: string
          message: string | null
          raw_payload: Json | null
        }
        Insert: {
          created_at?: string
          error_type: string
          event_source_url?: string | null
          id?: string
          ingestion_run_id: string
          message?: string | null
          raw_payload?: Json | null
        }
        Update: {
          created_at?: string
          error_type?: string
          event_source_url?: string | null
          id?: string
          ingestion_run_id?: string
          message?: string | null
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_errors_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          ended_at: string | null
          errors_count: number | null
          id: string
          metadata: Json | null
          records_created: number | null
          records_fetched: number | null
          records_skipped: number | null
          records_updated: number | null
          source_id: string
          started_at: string
          status: Database["public"]["Enums"]["ingestion_status"]
        }
        Insert: {
          ended_at?: string | null
          errors_count?: number | null
          id?: string
          metadata?: Json | null
          records_created?: number | null
          records_fetched?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          source_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Update: {
          ended_at?: string | null
          errors_count?: number | null
          id?: string
          metadata?: Json | null
          records_created?: number | null
          records_fetched?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          source_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["ingestion_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      metro_areas: {
        Row: {
          core_cities: Json
          created_at: string
          id: string
          included_counties: Json
          included_zip_prefixes: Json | null
          name: string
          slug: string
        }
        Insert: {
          core_cities?: Json
          created_at?: string
          id?: string
          included_counties?: Json
          included_zip_prefixes?: Json | null
          name: string
          slug: string
        }
        Update: {
          core_cities?: Json
          created_at?: string
          id?: string
          included_counties?: Json
          included_zip_prefixes?: Json | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          last_name: string | null
          marital_status: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          last_name?: string | null
          marital_status?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          last_name?: string | null
          marital_status?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_events: {
        Row: {
          canonical_event_id: string | null
          event_id: string | null
          id: string
          notes: string | null
          saved_at: string
          user_id: string
        }
        Insert: {
          canonical_event_id?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          saved_at?: string
          user_id: string
        }
        Update: {
          canonical_event_id?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          category_slug: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          id: string
          metro_area_id: string | null
          results_count: number | null
          searched_city_or_zip: string | null
        }
        Insert: {
          category_slug?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          metro_area_id?: string | null
          results_count?: number | null
          searched_city_or_zip?: string | null
        }
        Update: {
          category_slug?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          metro_area_id?: string | null
          results_count?: number | null
          searched_city_or_zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_metro_area_id_fkey"
            columns: ["metro_area_id"]
            isOneToOne: false
            referencedRelation: "metro_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      search_preferences: {
        Row: {
          category_id: string | null
          city: string | null
          created_at: string
          id: string
          state: string | null
          subcategory_id: string | null
          user_id: string
        }
        Insert: {
          category_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          state?: string | null
          subcategory_id?: string | null
          user_id: string
        }
        Update: {
          category_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          state?: string | null
          subcategory_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_preferences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_preferences_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      source_events: {
        Row: {
          canonical_event_id: string | null
          created_at: string
          external_event_id: string | null
          extracted_image_urls: Json | null
          feed_id: string | null
          fetched_at: string
          id: string
          normalized_hash: string | null
          parse_status: Database["public"]["Enums"]["parse_status"]
          raw_payload: Json | null
          source_id: string
          source_url: string | null
        }
        Insert: {
          canonical_event_id?: string | null
          created_at?: string
          external_event_id?: string | null
          extracted_image_urls?: Json | null
          feed_id?: string | null
          fetched_at?: string
          id?: string
          normalized_hash?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          raw_payload?: Json | null
          source_id: string
          source_url?: string | null
        }
        Update: {
          canonical_event_id?: string | null
          created_at?: string
          external_event_id?: string | null
          extracted_image_urls?: Json | null
          feed_id?: string | null
          fetched_at?: string
          id?: string
          normalized_hash?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          raw_payload?: Json | null
          source_id?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_events_canonical_event_id_fkey"
            columns: ["canonical_event_id"]
            isOneToOne: false
            referencedRelation: "canonical_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_events_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feed_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          auth_method: string | null
          base_url: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean
          metro_area_id: string | null
          name: string
          rate_limit_notes: string | null
          trust_score: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
        }
        Insert: {
          auth_method?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          metro_area_id?: string | null
          name: string
          rate_limit_notes?: string | null
          trust_score?: number
          type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Update: {
          auth_method?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          metro_area_id?: string | null
          name?: string
          rate_limit_notes?: string | null
          trust_score?: number
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_metro_area_id_fkey"
            columns: ["metro_area_id"]
            isOneToOne: false
            referencedRelation: "metro_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address_1: string | null
          address_2: string | null
          city: string | null
          county: string | null
          created_at: string
          id: string
          latitude: number | null
          location: unknown
          longitude: number | null
          metro_area_id: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          venue_url: string | null
          zip: string | null
        }
        Insert: {
          address_1?: string | null
          address_2?: string | null
          city?: string | null
          county?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          metro_area_id?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          venue_url?: string | null
          zip?: string | null
        }
        Update: {
          address_1?: string | null
          address_2?: string | null
          city?: string | null
          county?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location?: unknown
          longitude?: number | null
          metro_area_id?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          venue_url?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_metro_area_id_fkey"
            columns: ["metro_area_id"]
            isOneToOne: false
            referencedRelation: "metro_areas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_event_hash: {
        Args: {
          p_city: string
          p_start_time: string
          p_title: string
          p_venue_name?: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      map_to_app_category: {
        Args: { p_source_category: string }
        Returns: string
      }
      search_events: {
        Args: {
          p_category_slug?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_metro_slug?: string
          p_offset?: number
        }
        Returns: {
          age_restriction: number
          all_day: boolean
          category_names: string[]
          description_short: string
          discount_info: string
          end_time: string
          event_id: string
          image_url: string
          is_free: boolean
          metro_name: string
          price_max: number
          price_min: number
          source_url: string
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          ticket_url: string
          title: string
          venue_address: string
          venue_city: string
          venue_lat: number
          venue_lon: number
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
      search_events_by_radius: {
        Args: {
          p_category_id?: string
          p_date_from?: string
          p_date_to?: string
          p_lat: number
          p_limit?: number
          p_lon: number
          p_radius_meters?: number
        }
        Returns: {
          age_restriction: number
          all_day: boolean
          description_short: string
          distance_meters: number
          end_time: string
          event_id: string
          image_url: string
          is_free: boolean
          price_max: number
          price_min: number
          start_time: string
          status: Database["public"]["Enums"]["event_status"]
          ticket_url: string
          title: string
          venue_city: string
          venue_lat: number
          venue_lon: number
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
    }
    Enums: {
      app_role: "general" | "business" | "admin"
      event_status: "active" | "cancelled" | "postponed" | "expired"
      feed_type: "rss" | "ical" | "auto" | "html"
      gender_type: "male" | "female" | "nonbinary" | "other"
      ingestion_status: "running" | "completed" | "failed" | "partial"
      parse_status: "pending" | "parsed" | "matched" | "failed" | "skipped"
      refresh_frequency: "hourly" | "daily"
      source_category: "city" | "parks_rec" | "library" | "venue" | "other"
      source_type: "api" | "rss" | "ical" | "scrape" | "manual"
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
      app_role: ["general", "business", "admin"],
      event_status: ["active", "cancelled", "postponed", "expired"],
      feed_type: ["rss", "ical", "auto", "html"],
      gender_type: ["male", "female", "nonbinary", "other"],
      ingestion_status: ["running", "completed", "failed", "partial"],
      parse_status: ["pending", "parsed", "matched", "failed", "skipped"],
      refresh_frequency: ["hourly", "daily"],
      source_category: ["city", "parks_rec", "library", "venue", "other"],
      source_type: ["api", "rss", "ical", "scrape", "manual"],
    },
  },
} as const
