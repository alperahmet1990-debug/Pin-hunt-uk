// ============================================================
// PinHunt UK — Supabase Database Types
// Updated through migration 007 (Collectors Nearby)
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          trading_region: string | null;
          international_trading_enabled: boolean;
          allow_trade_requests: boolean;
          allow_messages: boolean;
          profile_visibility: 'public' | 'private';
          is_admin: boolean;
          created_at: string;
          updated_at: string;
          // ── Migration 007: local discovery ──────────────────────────────
          town: string | null;
          county: string | null;
          country: string | null;
          /**
           * Internal use only — column SELECT is REVOKED for authenticated/anon
           * (migration 008). Never read this from client code.
           */
          approx_lat: number | null;
          /**
           * Internal use only — column SELECT is REVOKED for authenticated/anon
           * (migration 008). Never read this from client code.
           */
          approx_lng: number | null;
          /**
           * Safe, client-readable boolean kept in sync with approx_lat by
           * the sync_has_location_set trigger (migration 008).
           * Use this instead of reading approx_lat.
           */
          has_location_set: boolean;
          nearby_discovery_enabled: boolean;
          preferred_radius_miles: number;
          open_to_local_trades: boolean;
          open_to_postal_trades: boolean;
          happy_to_travel: boolean;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          location?: string | null;
          trading_region?: string | null;
          international_trading_enabled?: boolean;
          allow_trade_requests?: boolean;
          allow_messages?: boolean;
          profile_visibility?: 'public' | 'private';
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
          town?: string | null;
          county?: string | null;
          country?: string | null;
          approx_lat?: number | null;
          approx_lng?: number | null;
          /** Managed by sync_has_location_set trigger — do not set manually. */
          has_location_set?: boolean;
          nearby_discovery_enabled?: boolean;
          preferred_radius_miles?: number;
          open_to_local_trades?: boolean;
          open_to_postal_trades?: boolean;
          happy_to_travel?: boolean;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          location?: string | null;
          trading_region?: string | null;
          international_trading_enabled?: boolean;
          allow_trade_requests?: boolean;
          allow_messages?: boolean;
          profile_visibility?: 'public' | 'private';
          is_admin?: boolean;
          updated_at?: string;
          town?: string | null;
          county?: string | null;
          country?: string | null;
          approx_lat?: number | null;
          approx_lng?: number | null;
          /** Managed by sync_has_location_set trigger — do not set manually. */
          has_location_set?: boolean;
          nearby_discovery_enabled?: boolean;
          preferred_radius_miles?: number;
          open_to_local_trades?: boolean;
          open_to_postal_trades?: boolean;
          happy_to_travel?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      pins: {
        Row: {
          id: string;
          pinhunt_id: string;
          title: string;
          brand: string;
          collection: string;
          release_date: string | null;
          release_year: number | null;
          retail_price: number | null;
          currency: string;
          limited_edition_size: number | null;
          estimated_value_gbp: number | null;
          description: string | null;
          is_new_release: boolean;
          origin: string | null;
          edition_type: string | null;
          image_url: string | null;
          back_image_url: string | null;
          external_identifiers: Json;
          verification_status: 'verified' | 'needs_source_verification' | 'community_submitted' | 'unverified';
          status: 'active' | 'pending_review' | 'archived';
          is_user_submitted: boolean;
          submitted_by: string | null;
          catalogue_source: string | null;
          catalogue_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pinhunt_id: string;
          title: string;
          brand: string;
          collection: string;
          release_date?: string | null;
          release_year?: number | null;
          retail_price?: number | null;
          currency?: string;
          limited_edition_size?: number | null;
          estimated_value_gbp?: number | null;
          description?: string | null;
          is_new_release?: boolean;
          origin?: string | null;
          edition_type?: string | null;
          image_url?: string | null;
          back_image_url?: string | null;
          external_identifiers?: Json;
          verification_status?: 'verified' | 'needs_source_verification' | 'community_submitted' | 'unverified';
          status?: 'active' | 'pending_review' | 'archived';
          is_user_submitted?: boolean;
          submitted_by?: string | null;
          catalogue_source?: string | null;
          catalogue_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pinhunt_id?: string;
          title?: string;
          brand?: string;
          collection?: string;
          release_date?: string | null;
          release_year?: number | null;
          retail_price?: number | null;
          currency?: string;
          limited_edition_size?: number | null;
          estimated_value_gbp?: number | null;
          description?: string | null;
          is_new_release?: boolean;
          origin?: string | null;
          edition_type?: string | null;
          image_url?: string | null;
          back_image_url?: string | null;
          external_identifiers?: Json;
          verification_status?: 'verified' | 'needs_source_verification' | 'community_submitted' | 'unverified';
          status?: 'active' | 'pending_review' | 'archived';
          is_user_submitted?: boolean;
          submitted_by?: string | null;
          catalogue_source?: string | null;
          catalogue_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pins_submitted_by_fkey';
            columns: ['submitted_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      characters: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      pin_characters: {
        Row: { pin_id: string; character_id: string };
        Insert: { pin_id: string; character_id: string };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'pin_characters_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] },
          { foreignKeyName: 'pin_characters_character_id_fkey'; columns: ['character_id']; referencedRelation: 'characters'; referencedColumns: ['id'] }
        ];
      };
      categories: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      pin_categories: {
        Row: { pin_id: string; category_id: string };
        Insert: { pin_id: string; category_id: string };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'pin_categories_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] },
          { foreignKeyName: 'pin_categories_category_id_fkey'; columns: ['category_id']; referencedRelation: 'categories'; referencedColumns: ['id'] }
        ];
      };
      pin_external_ids: {
        Row: { id: string; pin_id: string; source: string; external_id: string; created_at: string; updated_at: string };
        Insert: { id?: string; pin_id: string; source: string; external_id: string; created_at?: string; updated_at?: string };
        Update: { source?: string; external_id?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'pin_external_ids_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      pin_images: {
        Row: { id: string; pin_id: string; image_url: string; image_type: 'front' | 'back' | 'reference' | 'scan'; description: string | null; is_primary: boolean; uploaded_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; pin_id: string; image_url: string; image_type?: 'front' | 'back' | 'reference' | 'scan'; description?: string | null; is_primary?: boolean; uploaded_by?: string | null; created_at?: string; updated_at?: string };
        Update: { image_url?: string; image_type?: 'front' | 'back' | 'reference' | 'scan'; description?: string | null; is_primary?: boolean; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'pin_images_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      pin_sources: {
        Row: { id: string; pin_id: string; source_url: string; source_name: string | null; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; pin_id: string; source_url: string; source_name?: string | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { source_url?: string; source_name?: string | null; notes?: string | null };
        Relationships: [
          { foreignKeyName: 'pin_sources_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      user_pins: {
        Row: { id: string; user_id: string; pin_id: string; status: 'owned' | 'wanted' | 'for_trade' | 'traded'; acquired_date: string | null; purchase_price_gbp: number | null; current_value_gbp: number | null; notes: string | null; condition: 'mint' | 'near_mint' | 'good' | 'fair' | 'poor' | null; is_favourite: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; pin_id: string; status: 'owned' | 'wanted' | 'for_trade' | 'traded'; acquired_date?: string | null; purchase_price_gbp?: number | null; current_value_gbp?: number | null; notes?: string | null; condition?: 'mint' | 'near_mint' | 'good' | 'fair' | 'poor' | null; is_favourite?: boolean; created_at?: string; updated_at?: string };
        Update: { status?: 'owned' | 'wanted' | 'for_trade' | 'traded'; acquired_date?: string | null; purchase_price_gbp?: number | null; current_value_gbp?: number | null; notes?: string | null; condition?: 'mint' | 'near_mint' | 'good' | 'fair' | 'poor' | null; is_favourite?: boolean; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'user_pins_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'user_pins_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      user_pin_images: {
        Row: { id: string; user_id: string; user_pin_id: string; storage_path: string; is_primary: boolean; created_at: string };
        Insert: { id?: string; user_id: string; user_pin_id: string; storage_path: string; is_primary?: boolean; created_at?: string };
        Update: { storage_path?: string; is_primary?: boolean };
        Relationships: [
          { foreignKeyName: 'user_pin_images_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'user_pin_images_user_pin_id_fkey'; columns: ['user_pin_id']; referencedRelation: 'user_pins'; referencedColumns: ['id'] }
        ];
      };
      pin_submissions: {
        Row: {
          id: string;
          submitted_by: string;
          proposed_name: string;
          brand: string;
          series_name: string | null;
          release_location: string | null;
          release_year: number | null;
          edition_type: 'open_edition' | 'limited_edition' | 'limited_release' | 'mystery' | 'hidden_disney' | 'unknown';
          edition_size: number | null;
          fac_number: string | null;
          sku: string | null;
          character_names: string[] | null;
          front_image_path: string;
          back_image_path: string | null;
          notes: string | null;
          status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_changes';
          reviewer_notes: string | null;
          approved_pin_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submitted_by: string;
          proposed_name: string;
          brand: string;
          series_name?: string | null;
          release_location?: string | null;
          release_year?: number | null;
          edition_type?: 'open_edition' | 'limited_edition' | 'limited_release' | 'mystery' | 'hidden_disney' | 'unknown';
          edition_size?: number | null;
          fac_number?: string | null;
          sku?: string | null;
          character_names?: string[] | null;
          front_image_path: string;
          back_image_path?: string | null;
          notes?: string | null;
          status?: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_changes';
          reviewer_notes?: string | null;
          approved_pin_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          proposed_name?: string;
          brand?: string;
          series_name?: string | null;
          release_location?: string | null;
          release_year?: number | null;
          edition_type?: 'open_edition' | 'limited_edition' | 'limited_release' | 'mystery' | 'hidden_disney' | 'unknown';
          edition_size?: number | null;
          fac_number?: string | null;
          sku?: string | null;
          character_names?: string[] | null;
          front_image_path?: string;
          back_image_path?: string | null;
          notes?: string | null;
          status?: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_changes';
          reviewer_notes?: string | null;
          approved_pin_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'pin_submissions_submitted_by_fkey'; columns: ['submitted_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'pin_submissions_approved_pin_id_fkey'; columns: ['approved_pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      scan_attempts: {
        Row: { id: string; user_id: string; matched_pin_id: string | null; confidence: number | null; scan_image_path: string | null; result_data: Json; created_at: string };
        Insert: { id?: string; user_id: string; matched_pin_id?: string | null; confidence?: number | null; scan_image_path?: string | null; result_data?: Json; created_at?: string };
        Update: { matched_pin_id?: string | null; confidence?: number | null };
        Relationships: [
          { foreignKeyName: 'scan_attempts_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'scan_attempts_matched_pin_id_fkey'; columns: ['matched_pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      price_history: {
        Row: { id: string; pin_id: string; price_gbp: number; source: string | null; condition: string | null; notes: string | null; recorded_at: string; created_at: string };
        Insert: { id?: string; pin_id: string; price_gbp: number; source?: string | null; condition?: string | null; notes?: string | null; recorded_at?: string; created_at?: string };
        Update: { price_gbp?: number; source?: string | null; condition?: string | null; notes?: string | null };
        Relationships: [
          { foreignKeyName: 'price_history_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      trades: {
        Row: { id: string; initiator_id: string; recipient_id: string; status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled'; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; initiator_id: string; recipient_id: string; status?: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled'; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { status?: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled'; notes?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'trades_initiator_id_fkey'; columns: ['initiator_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'trades_recipient_id_fkey'; columns: ['recipient_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
      trade_items: {
        Row: { id: string; trade_id: string; user_pin_id: string; direction: 'offered' | 'requested'; created_at: string };
        Insert: { id?: string; trade_id: string; user_pin_id: string; direction: 'offered' | 'requested'; created_at?: string };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'trade_items_trade_id_fkey'; columns: ['trade_id']; referencedRelation: 'trades'; referencedColumns: ['id'] },
          { foreignKeyName: 'trade_items_user_pin_id_fkey'; columns: ['user_pin_id']; referencedRelation: 'user_pins'; referencedColumns: ['id'] }
        ];
      };
      trade_messages: {
        Row: { id: string; trade_id: string; sender_id: string; message: string; created_at: string };
        Insert: { id?: string; trade_id: string; sender_id: string; message: string; created_at?: string };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'trade_messages_trade_id_fkey'; columns: ['trade_id']; referencedRelation: 'trades'; referencedColumns: ['id'] },
          { foreignKeyName: 'trade_messages_sender_id_fkey'; columns: ['sender_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
      trade_ratings: {
        Row: {
          id: string;
          trade_id: string | null;
          rater_id: string;
          ratee_id: string;
          is_positive: boolean;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trade_id?: string | null;
          rater_id: string;
          ratee_id: string;
          is_positive: boolean;
          comment?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          { foreignKeyName: 'trade_ratings_trade_id_fkey'; columns: ['trade_id']; referencedRelation: 'trades'; referencedColumns: ['id'] }
        ];
      };
      external_sale_listings: {
        Row: {
          id: string;
          seller_id: string;
          pin_id: string;
          platform: 'vinted' | 'ebay' | 'other';
          listing_url: string;
          asking_price: number | null;
          currency: string | null;
          status: 'draft' | 'active' | 'sold' | 'expired' | 'removed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          pin_id: string;
          platform: 'vinted' | 'ebay' | 'other';
          listing_url: string;
          asking_price?: number | null;
          currency?: string | null;
          status?: 'draft' | 'active' | 'sold' | 'expired' | 'removed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          listing_url?: string;
          asking_price?: number | null;
          currency?: string | null;
          status?: 'draft' | 'active' | 'sold' | 'expired' | 'removed';
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'external_sale_listings_seller_id_fkey'; columns: ['seller_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'external_sale_listings_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      community_posts: {
        Row: {
          id: string;
          author_id: string;
          post_type: 'in_search_of' | 'for_trade' | 'for_sale' | 'new_pickup' | 'discussion';
          body: string;
          photos: Json;
          linked_pin_id: string | null;
          public_slug: string;
          share_image_url: string | null;
          facebook_share_clicked_at: string | null;
          share_count: number;
          price_text: string | null;
          looking_for: string | null;
          location_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          post_type: 'in_search_of' | 'for_trade' | 'for_sale' | 'new_pickup' | 'discussion';
          body: string;
          photos?: Json;
          linked_pin_id?: string | null;
          public_slug?: string;
          share_image_url?: string | null;
          facebook_share_clicked_at?: string | null;
          share_count?: number;
          price_text?: string | null;
          looking_for?: string | null;
          location_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          post_type?: 'in_search_of' | 'for_trade' | 'for_sale' | 'new_pickup' | 'discussion';
          body?: string;
          photos?: Json;
          linked_pin_id?: string | null;
          share_image_url?: string | null;
          facebook_share_clicked_at?: string | null;
          share_count?: number;
          price_text?: string | null;
          looking_for?: string | null;
          location_text?: string | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'community_posts_author_id_fkey'; columns: ['author_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'community_posts_linked_pin_id_fkey'; columns: ['linked_pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
        ];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [
          { foreignKeyName: 'post_comments_post_id_fkey'; columns: ['post_id']; referencedRelation: 'community_posts'; referencedColumns: ['id'] },
          { foreignKeyName: 'post_comments_author_id_fkey'; columns: ['author_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
      conversations: {
        Row: {
          id: string;
          participant_a_id: string;
          participant_b_id: string;
          context_post_id: string | null;
          context_pin_id: string | null;
          last_message_at: string | null;
          a_last_read_at: string | null;
          b_last_read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          participant_a_id: string;
          participant_b_id: string;
          context_post_id?: string | null;
          context_pin_id?: string | null;
          last_message_at?: string | null;
          created_at?: string;
        };
        Update: {
          last_message_at?: string | null;
          a_last_read_at?: string | null;
          b_last_read_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'conversations_participant_a_id_fkey'; columns: ['participant_a_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'conversations_participant_b_id_fkey'; columns: ['participant_b_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [
          { foreignKeyName: 'conversation_messages_conversation_id_fkey'; columns: ['conversation_id']; referencedRelation: 'conversations'; referencedColumns: ['id'] },
          { foreignKeyName: 'conversation_messages_sender_id_fkey'; columns: ['sender_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ];
      };
    };
    Views: {
      /**
       * Security-barrier view for public profile reads.
       * Intentionally excludes approx_lat and approx_lng — use this view
       * (or explicit column selection on profiles) for any public-facing query.
       */
      public_profiles_safe: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          trading_region: string | null;
          international_trading_enabled: boolean;
          allow_trade_requests: boolean;
          allow_messages: boolean;
          profile_visibility: 'public' | 'private';
          is_admin: boolean;
          created_at: string;
          updated_at: string;
          town: string | null;
          county: string | null;
          country: string | null;
          nearby_discovery_enabled: boolean;
          preferred_radius_miles: number;
          open_to_local_trades: boolean;
          open_to_postal_trades: boolean;
          happy_to_travel: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      mark_conversation_read: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      get_conversation_unread_counts: {
        Args: Record<string, never>;
        Returns: { conversation_id: string; unread_count: number }[];
      };
      set_user_pin_status: {
        Args: { p_pinhunt_id: string; p_status: string };
        Returns: undefined;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_collectors_nearby: {
        Args: { p_viewer_id: string; p_radius_miles?: number };
        Returns: Array<{
          id: string;
          username: string;
          avatar_url: string | null;
          bio: string | null;
          town: string | null;
          county: string | null;
          distance_band: string;
          distance_sort_key: number;
          open_to_local_trades: boolean;
          open_to_postal_trades: boolean;
          happy_to_travel: boolean;
          for_trade_count: number;
          wanted_count: number;
          pins_they_have_i_want: number;
          pins_i_have_they_want: number;
          match_score: number;
          last_active_at: string | null;
          positive_ratings: number;
          total_ratings: number;
        }>;
      };
      get_potential_trades: {
        Args: { p_viewer_id: string; p_collector_id: string };
        Returns: Array<{
          direction: string;
          pin_id: string;
          pinhunt_id: string;
          title: string;
          image_url: string | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
