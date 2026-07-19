// ============================================================
// PinHunt UK — Supabase Database Types
// Generated from supabase/migrations/001_schema.sql
//
// These types mirror what `supabase gen types typescript` produces.
// Update this file whenever the schema changes.
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
        };
        Insert: {
          id: string; // FK to auth.users — required
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
        Update: { source_url?: string; source_name?: string | null; notes?: string | null; updated_at?: string };
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
        Row: { id: string; submitted_by: string; pin_id: string | null; submission_type: 'new_pin' | 'correction' | 'image'; proposed_data: Json; notes: string | null; status: 'pending' | 'approved' | 'rejected'; reviewed_by: string | null; reviewed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; submitted_by: string; pin_id?: string | null; submission_type: 'new_pin' | 'correction' | 'image'; proposed_data?: Json; notes?: string | null; status?: 'pending' | 'approved' | 'rejected'; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string; updated_at?: string };
        Update: { status?: 'pending' | 'approved' | 'rejected'; reviewed_by?: string | null; reviewed_at?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'pin_submissions_submitted_by_fkey'; columns: ['submitted_by']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'pin_submissions_pin_id_fkey'; columns: ['pin_id']; referencedRelation: 'pins'; referencedColumns: ['id'] }
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
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience helpers — pick individual table row types without the full path.
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
