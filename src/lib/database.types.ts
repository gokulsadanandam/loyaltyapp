export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: string | null;
          created_at: string;
          id: number;
          merchant_id: string | null;
          new_data: Json | null;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: string | null;
          created_at?: string;
          id?: never;
          merchant_id?: string | null;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          created_at?: string;
          id?: never;
          merchant_id?: string | null;
          new_data?: Json | null;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          account_id: string;
          created_at: string;
          merchant_id: string;
          product_id: string;
          qty: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          created_at?: string;
          merchant_id: string;
          product_id: string;
          qty: number;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          merchant_id?: string;
          product_id?: string;
          qty?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_merchant_id_account_id_fkey";
            columns: ["merchant_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["merchant_id", "id"];
          },
          {
            foreignKeyName: "cart_items_merchant_id_product_id_fkey";
            columns: ["merchant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      ledger_accounts: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["ledger_account_kind"];
          loyalty_account_id: string | null;
          merchant_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["ledger_account_kind"];
          loyalty_account_id?: string | null;
          merchant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["ledger_account_kind"];
          loyalty_account_id?: string | null;
          merchant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_accounts_merchant_id_loyalty_account_id_fkey";
            columns: ["merchant_id", "loyalty_account_id"];
            isOneToOne: false;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          amount: number;
          created_at: string;
          id: number;
          ledger_account_id: string;
          txn_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          id?: never;
          ledger_account_id: string;
          txn_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: never;
          ledger_account_id?: string;
          txn_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_ledger_account_id_fkey";
            columns: ["ledger_account_id"];
            isOneToOne: false;
            referencedRelation: "ledger_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_txn_id_fkey";
            columns: ["txn_id"];
            isOneToOne: false;
            referencedRelation: "ledger_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_transactions: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          idempotency_key: string;
          kind: Database["public"]["Enums"]["ledger_txn_kind"];
          merchant_id: string;
          metadata: NonNullable<Json>;
          reason: string | null;
          ref_id: string | null;
          ref_type: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          kind: Database["public"]["Enums"]["ledger_txn_kind"];
          merchant_id: string;
          metadata?: NonNullable<Json>;
          reason?: string | null;
          ref_id?: string | null;
          ref_type?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          kind?: Database["public"]["Enums"]["ledger_txn_kind"];
          merchant_id?: string;
          metadata?: NonNullable<Json>;
          reason?: string | null;
          ref_id?: string | null;
          ref_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      loyalty_accounts: {
        Row: {
          created_at: string;
          id: string;
          merchant_id: string;
          tier_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          merchant_id: string;
          tier_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merchant_id?: string;
          tier_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_accounts_merchant_id_tier_id_fkey";
            columns: ["merchant_id", "tier_id"];
            isOneToOne: false;
            referencedRelation: "tiers";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      merchant_staff: {
        Row: {
          created_at: string;
          merchant_id: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          merchant_id: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          merchant_id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "merchant_staff_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      merchants: {
        Row: {
          active: boolean;
          created_at: string;
          currency: string;
          earn_rate_bps: number;
          id: string;
          is_default: boolean;
          max_redeem_bps: number;
          name: string;
          point_expiry_days: number | null;
          point_value_paise: number;
          signup_bonus_points: number;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          earn_rate_bps?: number;
          id?: string;
          is_default?: boolean;
          max_redeem_bps?: number;
          name: string;
          point_expiry_days?: number | null;
          point_value_paise?: number;
          signup_bonus_points?: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          currency?: string;
          earn_rate_bps?: number;
          id?: string;
          is_default?: boolean;
          max_redeem_bps?: number;
          name?: string;
          point_expiry_days?: number | null;
          point_value_paise?: number;
          signup_bonus_points?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: number;
          line_total_paise: number | null;
          list_price_paise: number;
          name_snapshot: string;
          order_id: string;
          product_id: string | null;
          qty: number;
          unit_price_paise: number;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          line_total_paise?: never;
          list_price_paise: number;
          name_snapshot: string;
          order_id: string;
          product_id?: string | null;
          qty: number;
          unit_price_paise: number;
        };
        Update: {
          id?: never;
          line_total_paise?: never;
          list_price_paise?: number;
          name_snapshot?: string;
          order_id?: string;
          product_id?: string | null;
          qty?: number;
          unit_price_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          account_id: string;
          cancelled_at: string | null;
          created_at: string;
          fulfilled_at: string | null;
          id: string;
          idempotency_key: string;
          merchant_id: string;
          payment_ref: string | null;
          points_discount_paise: number;
          points_earned: number;
          points_redeemed: number;
          refunded_at: string | null;
          shipping_address: Json | null;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string | null;
          subtotal_paise: number;
          total_paise: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          cancelled_at?: string | null;
          created_at?: string;
          fulfilled_at?: string | null;
          id?: string;
          idempotency_key: string;
          merchant_id: string;
          payment_ref?: string | null;
          points_discount_paise?: number;
          points_earned?: number;
          points_redeemed?: number;
          refunded_at?: string | null;
          shipping_address?: Json | null;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string | null;
          subtotal_paise: number;
          total_paise: number;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          cancelled_at?: string | null;
          created_at?: string;
          fulfilled_at?: string | null;
          id?: string;
          idempotency_key?: string;
          merchant_id?: string;
          payment_ref?: string | null;
          points_discount_paise?: number;
          points_earned?: number;
          points_redeemed?: number;
          refunded_at?: string | null;
          shipping_address?: Json | null;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string | null;
          subtotal_paise?: number;
          total_paise?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_merchant_id_account_id_fkey";
            columns: ["merchant_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["merchant_id", "id"];
          },
          {
            foreignKeyName: "orders_merchant_id_store_id_fkey";
            columns: ["merchant_id", "store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      point_balances: {
        Row: {
          balance: number;
          lifetime_earned: number;
          loyalty_account_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          balance?: number;
          lifetime_earned?: number;
          loyalty_account_id: string;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          lifetime_earned?: number;
          loyalty_account_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_balances_loyalty_account_id_fkey";
            columns: ["loyalty_account_id"];
            isOneToOne: true;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      point_lots: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          loyalty_account_id: string;
          original: number;
          remaining: number;
          source_txn_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          loyalty_account_id: string;
          original: number;
          remaining: number;
          source_txn_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          loyalty_account_id?: string;
          original?: number;
          remaining?: number;
          source_txn_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_lots_loyalty_account_id_fkey";
            columns: ["loyalty_account_id"];
            isOneToOne: false;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_lots_source_txn_id_fkey";
            columns: ["source_txn_id"];
            isOneToOne: false;
            referencedRelation: "ledger_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          active: boolean;
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          image_path: string | null;
          list_price_paise: number;
          merchant_id: string;
          name: string;
          sale_price_paise: number;
          short_name: string | null;
          sku: string;
          specs: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          list_price_paise: number;
          merchant_id: string;
          name: string;
          sale_price_paise: number;
          short_name?: string | null;
          sku: string;
          specs?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_path?: string | null;
          list_price_paise?: number;
          merchant_id?: string;
          name?: string;
          sale_price_paise?: number;
          short_name?: string | null;
          sku?: string;
          specs?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          member_code: string;
          phone: string | null;
          referral_code: string;
          referred_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          first_name?: string | null;
          id: string;
          last_name?: string | null;
          member_code?: string;
          phone?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          member_code?: string;
          phone?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey";
            columns: ["referred_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_redemptions: {
        Row: {
          account_id: string;
          code: string;
          created_at: string;
          id: string;
          idempotency_key: string;
          merchant_id: string;
          points_spent: number;
          reward_id: string;
          status: Database["public"]["Enums"]["redemption_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          code?: string;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          merchant_id: string;
          points_spent: number;
          reward_id: string;
          status?: Database["public"]["Enums"]["redemption_status"];
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          code?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          merchant_id?: string;
          points_spent?: number;
          reward_id?: string;
          status?: Database["public"]["Enums"]["redemption_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_merchant_id_account_id_fkey";
            columns: ["merchant_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "loyalty_accounts";
            referencedColumns: ["merchant_id", "id"];
          },
          {
            foreignKeyName: "reward_redemptions_merchant_id_reward_id_fkey";
            columns: ["merchant_id", "reward_id"];
            isOneToOne: false;
            referencedRelation: "rewards";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      rewards: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          image_path: string | null;
          merchant_id: string;
          name: string;
          points_cost: number;
          product_id: string | null;
          starts_at: string | null;
          stock: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          image_path?: string | null;
          merchant_id: string;
          name: string;
          points_cost: number;
          product_id?: string | null;
          starts_at?: string | null;
          stock?: number | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          image_path?: string | null;
          merchant_id?: string;
          name?: string;
          points_cost?: number;
          product_id?: string | null;
          starts_at?: string | null;
          stock?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rewards_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rewards_merchant_id_product_id_fkey";
            columns: ["merchant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["merchant_id", "id"];
          },
        ];
      };
      stores: {
        Row: {
          active: boolean;
          address_line: string;
          city: string;
          created_at: string;
          id: string;
          location: unknown;
          merchant_id: string;
          name: string;
          phone: string | null;
          postal_code: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          address_line: string;
          city: string;
          created_at?: string;
          id?: string;
          location: unknown;
          merchant_id: string;
          name: string;
          phone?: string | null;
          postal_code?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address_line?: string;
          city?: string;
          created_at?: string;
          id?: string;
          location?: unknown;
          merchant_id?: string;
          name?: string;
          phone?: string | null;
          postal_code?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stores_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      tiers: {
        Row: {
          created_at: string;
          id: string;
          merchant_id: string;
          min_lifetime_points: number;
          multiplier_bps: number;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          merchant_id: string;
          min_lifetime_points: number;
          multiplier_bps?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merchant_id?: string;
          min_lifetime_points?: number;
          multiplier_bps?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tiers_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_adjust: {
        Args: {
          p_account_id: string;
          p_idempotency_key: string;
          p_points: number;
          p_reason: string;
        };
        Returns: string;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      fulfill_order: { Args: { p_order_id: string; p_payment_ref?: string }; Returns: string };
      nearby_stores: {
        Args: { p_lat: number; p_lng: number; p_merchant_id?: string; p_radius_m?: number };
        Returns: {
          address_line: string;
          city: string;
          distance_m: number;
          id: string;
          name: string;
        }[];
      };
      place_order: {
        Args: {
          p_idempotency_key: string;
          p_merchant_id?: string;
          p_points_to_redeem?: number;
          p_shipping_address?: Json;
          p_store_id?: string;
        };
        Returns: string;
      };
      redeem_reward: { Args: { p_idempotency_key: string; p_reward_id: string }; Returns: string };
      refund_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: Database["public"]["Enums"]["order_status"];
      };
      staff_award_points: {
        Args: {
          p_amount_paise: number;
          p_idempotency_key: string;
          p_member_code: string;
          p_merchant_id?: string;
          p_store_id?: string;
        };
        Returns: string;
      };
    };
    Enums: {
      ledger_account_kind: "customer" | "issued" | "redeemed" | "expired" | "adjustment";
      ledger_txn_kind:
        | "signup"
        | "earn"
        | "earn_reversal"
        | "redeem"
        | "redeem_reversal"
        | "expire"
        | "adjust"
        | "referral"
        | "migration";
      order_status: "pending" | "fulfilled" | "cancelled" | "refunded";
      redemption_status: "issued" | "fulfilled" | "cancelled";
      staff_role: "owner" | "admin" | "cashier";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ledger_account_kind: ["customer", "issued", "redeemed", "expired", "adjustment"],
      ledger_txn_kind: [
        "signup",
        "earn",
        "earn_reversal",
        "redeem",
        "redeem_reversal",
        "expire",
        "adjust",
        "referral",
        "migration",
      ],
      order_status: ["pending", "fulfilled", "cancelled", "refunded"],
      redemption_status: ["issued", "fulfilled", "cancelled"],
      staff_role: ["owner", "admin", "cashier"],
    },
  },
} as const;
