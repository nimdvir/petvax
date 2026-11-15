export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          address: string | null;
          business_name: string;
          certificate_accent_color: string;
          certificate_footer: string | null;
          default_visit_minutes: number;
          email: string | null;
          id: boolean;
          notify_email: string | null;
          phone: string | null;
          tagline: string | null;
          timezone: string;
          updated_at: string;
          website: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          business_name?: string;
          certificate_accent_color?: string;
          certificate_footer?: string | null;
          default_visit_minutes?: number;
          email?: string | null;
          id?: boolean;
          notify_email?: string | null;
          phone?: string | null;
          tagline?: string | null;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          business_name?: string;
          certificate_accent_color?: string;
          certificate_footer?: string | null;
          default_visit_minutes?: number;
          email?: string | null;
          id?: boolean;
          notify_email?: string | null;
          phone?: string | null;
          tagline?: string | null;
          timezone?: string;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      appointment_pets: {
        Row: {
          appointment_id: string;
          pet_id: string;
          requested_vaccines: string[];
        };
        ComputedFields: never;
        Insert: {
          appointment_id: string;
          pet_id: string;
          requested_vaccines?: string[];
        };
        Update: {
          appointment_id?: string;
          pet_id?: string;
          requested_vaccines?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "appointment_pets_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_pets_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          assigned_staff_id: string | null;
          cancel_reason: string | null;
          canceled_at: string | null;
          client_confirmed_at: string | null;
          client_notes: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          created_by: string | null;
          ends_at: string | null;
          follow_up_on: string | null;
          id: string;
          internal_notes: string | null;
          owner_id: string;
          reminder_sent_at: string | null;
          requested_at: string;
          source: Database["public"]["Enums"]["record_source"];
          starts_at: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
          visit_address: string | null;
        };
        ComputedFields: never;
        Insert: {
          assigned_staff_id?: string | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          client_confirmed_at?: string | null;
          client_notes?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          follow_up_on?: string | null;
          id?: string;
          internal_notes?: string | null;
          owner_id: string;
          reminder_sent_at?: string | null;
          requested_at?: string;
          source?: Database["public"]["Enums"]["record_source"];
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
          visit_address?: string | null;
        };
        Update: {
          assigned_staff_id?: string | null;
          cancel_reason?: string | null;
          canceled_at?: string | null;
          client_confirmed_at?: string | null;
          client_notes?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          ends_at?: string | null;
          follow_up_on?: string | null;
          id?: string;
          internal_notes?: string | null;
          owner_id?: string;
          reminder_sent_at?: string | null;
          requested_at?: string;
          source?: Database["public"]["Enums"]["record_source"];
          starts_at?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
          visit_address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_staff_id_fkey";
            columns: ["assigned_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "appointments_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: string | null;
          details: NonNullable<Json>;
          hash: string;
          id: number;
          occurred_at: string;
          prev_hash: string | null;
          record_id: string | null;
          table_name: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: string | null;
          details?: NonNullable<Json>;
          hash: string;
          id?: never;
          occurred_at?: string;
          prev_hash?: string | null;
          record_id?: string | null;
          table_name?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          details?: NonNullable<Json>;
          hash?: string;
          id?: never;
          occurred_at?: string;
          prev_hash?: string | null;
          record_id?: string | null;
          table_name?: string | null;
        };
        Relationships: [];
      };
      certificate_vaccinations: {
        Row: {
          certificate_id: string;
          vaccination_id: string;
        };
        ComputedFields: never;
        Insert: {
          certificate_id: string;
          vaccination_id: string;
        };
        Update: {
          certificate_id?: string;
          vaccination_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_vaccinations_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificate_vaccinations_vaccination_id_fkey";
            columns: ["vaccination_id"];
            isOneToOne: false;
            referencedRelation: "vaccinations";
            referencedColumns: ["id"];
          },
        ];
      };
      certificates: {
        Row: {
          certificate_number: string;
          created_at: string;
          encounter_id: string | null;
          id: string;
          issued_at: string;
          issued_by: string;
          owner_id: string;
          pdf_path: string | null;
          pdf_sha256: string | null;
          pet_id: string;
          snapshot: NonNullable<Json>;
          status: Database["public"]["Enums"]["certificate_status"];
          verification_code: string;
          voided_at: string | null;
          voided_reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          certificate_number: string;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          issued_at?: string;
          issued_by: string;
          owner_id: string;
          pdf_path?: string | null;
          pdf_sha256?: string | null;
          pet_id: string;
          snapshot: NonNullable<Json>;
          status?: Database["public"]["Enums"]["certificate_status"];
          verification_code?: string;
          voided_at?: string | null;
          voided_reason?: string | null;
        };
        Update: {
          certificate_number?: string;
          created_at?: string;
          encounter_id?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string;
          owner_id?: string;
          pdf_path?: string | null;
          pdf_sha256?: string | null;
          pet_id?: string;
          snapshot?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["certificate_status"];
          verification_code?: string;
          voided_at?: string | null;
          voided_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "certificates_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          bucket: string;
          created_at: string;
          external_id: string | null;
          filename: string | null;
          id: string;
          kind: string;
          mime_type: string | null;
          owner_id: string | null;
          pet_id: string | null;
          sha256: string | null;
          size_bytes: number | null;
          source: Database["public"]["Enums"]["record_source"];
          storage_path: string;
          submission_id: string | null;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          created_at?: string;
          external_id?: string | null;
          filename?: string | null;
          id?: string;
          kind: string;
          mime_type?: string | null;
          owner_id?: string | null;
          pet_id?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          source?: Database["public"]["Enums"]["record_source"];
          storage_path: string;
          submission_id?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          external_id?: string | null;
          filename?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string | null;
          owner_id?: string | null;
          pet_id?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          source?: Database["public"]["Enums"]["record_source"];
          storage_path?: string;
          submission_id?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "intake_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      drive_archive_log: {
        Row: {
          created_at: string;
          drive_url: string | null;
          error: string | null;
          file_name: string;
          folder: string;
          id: string;
          kind: string;
          record_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          drive_url?: string | null;
          error?: string | null;
          file_name: string;
          folder: string;
          id?: string;
          kind: string;
          record_id: string;
          status: string;
        };
        Update: {
          created_at?: string;
          drive_url?: string | null;
          error?: string | null;
          file_name?: string;
          folder?: string;
          id?: string;
          kind?: string;
          record_id?: string;
          status?: string;
        };
        Relationships: [];
      };
      email_deliveries: {
        Row: {
          certificate_id: string | null;
          created_at: string;
          error: string | null;
          id: string;
          owner_id: string | null;
          provider: string;
          provider_message_id: string | null;
          sent_by: string | null;
          status: string;
          subject: string;
          to_email: string;
        };
        ComputedFields: never;
        Insert: {
          certificate_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          owner_id?: string | null;
          provider: string;
          provider_message_id?: string | null;
          sent_by?: string | null;
          status: string;
          subject: string;
          to_email: string;
        };
        Update: {
          certificate_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          owner_id?: string | null;
          provider?: string;
          provider_message_id?: string | null;
          sent_by?: string | null;
          status?: string;
          subject?: string;
          to_email?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_deliveries_certificate_id_fkey";
            columns: ["certificate_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_deliveries_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
        ];
      };
      encounters: {
        Row: {
          appointment_id: string | null;
          clinician_id: string | null;
          created_at: string;
          created_by: string | null;
          encounter_date: string;
          id: string;
          owner_id: string;
          pet_id: string;
        };
        ComputedFields: never;
        Insert: {
          appointment_id?: string | null;
          clinician_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          encounter_date?: string;
          id?: string;
          owner_id: string;
          pet_id: string;
        };
        Update: {
          appointment_id?: string | null;
          clinician_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          encounter_date?: string;
          id?: string;
          owner_id?: string;
          pet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "encounters_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_clinician_id_fkey";
            columns: ["clinician_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "encounters_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      external_ids: {
        Row: {
          entity_id: string;
          entity_type: string;
          external_id: string;
          imported_at: string;
          source: string;
        };
        ComputedFields: never;
        Insert: {
          entity_id: string;
          entity_type: string;
          external_id: string;
          imported_at?: string;
          source: string;
        };
        Update: {
          entity_id?: string;
          entity_type?: string;
          external_id?: string;
          imported_at?: string;
          source?: string;
        };
        Relationships: [];
      };
      form_links: {
        Row: {
          appointment_id: string | null;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          label: string;
          owner_id: string | null;
          revoked_at: string | null;
          share_token: string | null;
          template_id: string;
          token_hash: string;
          use_count: number;
        };
        ComputedFields: never;
        Insert: {
          appointment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          label: string;
          owner_id?: string | null;
          revoked_at?: string | null;
          share_token?: string | null;
          template_id: string;
          token_hash: string;
          use_count?: number;
        };
        Update: {
          appointment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          label?: string;
          owner_id?: string | null;
          revoked_at?: string | null;
          share_token?: string | null;
          template_id?: string;
          token_hash?: string;
          use_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "form_links_appointment_fk";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_links_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_links_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "form_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      form_templates: {
        Row: {
          archived: boolean;
          created_at: string;
          description: string | null;
          id: string;
          kind: Database["public"]["Enums"]["form_kind"];
          slug: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["form_kind"];
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["form_kind"];
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      form_versions: {
        Row: {
          change_note: string | null;
          consent_text: string | null;
          consent_text_sha256: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          published_at: string | null;
          published_by: string | null;
          schema: NonNullable<Json>;
          status: Database["public"]["Enums"]["form_version_status"];
          template_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          change_note?: string | null;
          consent_text?: string | null;
          consent_text_sha256?: never;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          published_by?: string | null;
          schema: NonNullable<Json>;
          status?: Database["public"]["Enums"]["form_version_status"];
          template_id: string;
          version: number;
        };
        Update: {
          change_note?: string | null;
          consent_text?: string | null;
          consent_text_sha256?: never;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          published_at?: string | null;
          published_by?: string | null;
          schema?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["form_version_status"];
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "form_versions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "form_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      import_runs: {
        Row: {
          dry_run: boolean;
          finished_at: string | null;
          id: string;
          reconciliation: NonNullable<Json>;
          source: string;
          started_at: string;
          started_by: string | null;
          stats: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          dry_run: boolean;
          finished_at?: string | null;
          id?: string;
          reconciliation?: NonNullable<Json>;
          source: string;
          started_at?: string;
          started_by?: string | null;
          stats?: NonNullable<Json>;
        };
        Update: {
          dry_run?: boolean;
          finished_at?: string | null;
          id?: string;
          reconciliation?: NonNullable<Json>;
          source?: string;
          started_at?: string;
          started_by?: string | null;
          stats?: NonNullable<Json>;
        };
        Relationships: [];
      };
      intake_submissions: {
        Row: {
          answers: NonNullable<Json>;
          created_at: string;
          external_id: string | null;
          form_link_id: string | null;
          form_version_id: string | null;
          id: string;
          idempotency_key: string | null;
          ip_address: unknown;
          match_result: Json | null;
          owner_id: string | null;
          pet_ids: string[];
          processing_error: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source: Database["public"]["Enums"]["record_source"];
          status: Database["public"]["Enums"]["submission_status"];
          submitted_at: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          answers: NonNullable<Json>;
          created_at?: string;
          external_id?: string | null;
          form_link_id?: string | null;
          form_version_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          ip_address?: unknown;
          match_result?: Json | null;
          owner_id?: string | null;
          pet_ids?: string[];
          processing_error?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["submission_status"];
          submitted_at?: string;
          user_agent?: string | null;
        };
        Update: {
          answers?: NonNullable<Json>;
          created_at?: string;
          external_id?: string | null;
          form_link_id?: string | null;
          form_version_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          ip_address?: unknown;
          match_result?: Json | null;
          owner_id?: string | null;
          pet_ids?: string[];
          processing_error?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["submission_status"];
          submitted_at?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "intake_submissions_form_link_id_fkey";
            columns: ["form_link_id"];
            isOneToOne: false;
            referencedRelation: "form_links";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intake_submissions_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "form_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intake_submissions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
        ];
      };
      owners: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          created_at: string;
          email: string | null;
          email_normalized: string | null;
          first_name: string;
          id: string;
          last_name: string;
          merged_into_id: string | null;
          notes: string | null;
          phone: string | null;
          phone_digits: string | null;
          phone_secondary: string | null;
          possible_duplicate_of: string[];
          postal_code: string | null;
          preferred_contact: Database["public"]["Enums"]["contact_method"] | null;
          review_status: Database["public"]["Enums"]["review_status"];
          source: Database["public"]["Enums"]["record_source"];
          state: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_normalized?: never;
          first_name: string;
          id?: string;
          last_name?: string;
          merged_into_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          phone_digits?: never;
          phone_secondary?: string | null;
          possible_duplicate_of?: string[];
          postal_code?: string | null;
          preferred_contact?: Database["public"]["Enums"]["contact_method"] | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          source?: Database["public"]["Enums"]["record_source"];
          state?: string | null;
          updated_at?: string;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_normalized?: never;
          first_name?: string;
          id?: string;
          last_name?: string;
          merged_into_id?: string | null;
          notes?: string | null;
          phone?: string | null;
          phone_digits?: never;
          phone_secondary?: string | null;
          possible_duplicate_of?: string[];
          postal_code?: string | null;
          preferred_contact?: Database["public"]["Enums"]["contact_method"] | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          source?: Database["public"]["Enums"]["record_source"];
          state?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "owners_merged_into_id_fkey";
            columns: ["merged_into_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
        ];
      };
      pet_owners: {
        Row: {
          created_at: string;
          is_primary: boolean;
          owner_id: string;
          pet_id: string;
          relationship: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          is_primary?: boolean;
          owner_id: string;
          pet_id: string;
          relationship?: string;
        };
        Update: {
          created_at?: string;
          is_primary?: boolean;
          owner_id?: string;
          pet_id?: string;
          relationship?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pet_owners_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pet_owners_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
        ];
      };
      pets: {
        Row: {
          allergies: string | null;
          breed: string | null;
          color: string | null;
          created_at: string;
          date_of_birth: string | null;
          deceased: boolean;
          diet: string | null;
          estimated_age_years: number | null;
          id: string;
          lifestyle: NonNullable<Json>;
          medical_conditions: string | null;
          medications: string | null;
          microchip: string | null;
          name: string;
          photo_path: string | null;
          prior_reactions: string | null;
          sex: Database["public"]["Enums"]["pet_sex"];
          source: Database["public"]["Enums"]["record_source"];
          spayed_neutered: boolean | null;
          species: Database["public"]["Enums"]["species"];
          species_other: string | null;
          updated_at: string;
          vaccine_history_notes: string | null;
          weight_lb: number | null;
        };
        ComputedFields: never;
        Insert: {
          allergies?: string | null;
          breed?: string | null;
          color?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          deceased?: boolean;
          diet?: string | null;
          estimated_age_years?: number | null;
          id?: string;
          lifestyle?: NonNullable<Json>;
          medical_conditions?: string | null;
          medications?: string | null;
          microchip?: string | null;
          name: string;
          photo_path?: string | null;
          prior_reactions?: string | null;
          sex?: Database["public"]["Enums"]["pet_sex"];
          source?: Database["public"]["Enums"]["record_source"];
          spayed_neutered?: boolean | null;
          species: Database["public"]["Enums"]["species"];
          species_other?: string | null;
          updated_at?: string;
          vaccine_history_notes?: string | null;
          weight_lb?: number | null;
        };
        Update: {
          allergies?: string | null;
          breed?: string | null;
          color?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          deceased?: boolean;
          diet?: string | null;
          estimated_age_years?: number | null;
          id?: string;
          lifestyle?: NonNullable<Json>;
          medical_conditions?: string | null;
          medications?: string | null;
          microchip?: string | null;
          name?: string;
          photo_path?: string | null;
          prior_reactions?: string | null;
          sex?: Database["public"]["Enums"]["pet_sex"];
          source?: Database["public"]["Enums"]["record_source"];
          spayed_neutered?: boolean | null;
          species?: Database["public"]["Enums"]["species"];
          species_other?: string | null;
          updated_at?: string;
          vaccine_history_notes?: string | null;
          weight_lb?: number | null;
        };
        Relationships: [];
      };
      signed_consents: {
        Row: {
          consent_text: string;
          consent_text_sha256: string;
          created_at: string;
          evidence: NonNullable<Json>;
          external_id: string | null;
          form_version_id: string | null;
          id: string;
          ip_address: unknown;
          owner_id: string;
          pet_id: string;
          prev_hash: string | null;
          record_hash: string;
          signature_path: string | null;
          signature_sha256: string | null;
          signed_at: string;
          signer_name: string;
          signer_relationship: string;
          source: Database["public"]["Enums"]["record_source"];
          submission_id: string | null;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          consent_text: string;
          consent_text_sha256: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          external_id?: string | null;
          form_version_id?: string | null;
          id?: string;
          ip_address?: unknown;
          owner_id: string;
          pet_id: string;
          prev_hash?: string | null;
          record_hash: string;
          signature_path?: string | null;
          signature_sha256?: string | null;
          signed_at: string;
          signer_name: string;
          signer_relationship: string;
          source?: Database["public"]["Enums"]["record_source"];
          submission_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          consent_text?: string;
          consent_text_sha256?: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          external_id?: string | null;
          form_version_id?: string | null;
          id?: string;
          ip_address?: unknown;
          owner_id?: string;
          pet_id?: string;
          prev_hash?: string | null;
          record_hash?: string;
          signature_path?: string | null;
          signature_sha256?: string | null;
          signed_at?: string;
          signer_name?: string;
          signer_relationship?: string;
          source?: Database["public"]["Enums"]["record_source"];
          submission_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signed_consents_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "form_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signed_consents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signed_consents_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signed_consents_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "intake_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      soap_note_revisions: {
        Row: {
          edited_at: string;
          edited_by: string | null;
          id: number;
          revision: number;
          snapshot: NonNullable<Json>;
          soap_note_id: string;
          status: Database["public"]["Enums"]["note_status"];
        };
        ComputedFields: never;
        Insert: {
          edited_at?: string;
          edited_by?: string | null;
          id?: never;
          revision: number;
          snapshot: NonNullable<Json>;
          soap_note_id: string;
          status: Database["public"]["Enums"]["note_status"];
        };
        Update: {
          edited_at?: string;
          edited_by?: string | null;
          id?: never;
          revision?: number;
          snapshot?: NonNullable<Json>;
          soap_note_id?: string;
          status?: Database["public"]["Enums"]["note_status"];
        };
        Relationships: [
          {
            foreignKeyName: "soap_note_revisions_soap_note_id_fkey";
            columns: ["soap_note_id"];
            isOneToOne: false;
            referencedRelation: "soap_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      soap_notes: {
        Row: {
          amendment_reason: string | null;
          assessment: string | null;
          body_condition_scale: number | null;
          body_condition_score: number | null;
          created_at: string;
          created_by: string | null;
          encounter_id: string;
          exam_findings: string | null;
          finalized_at: string | null;
          finalized_by: string | null;
          fit_for_vaccination: boolean | null;
          follow_up: string | null;
          general_appearance: string | null;
          heart_rate_bpm: number | null;
          id: string;
          objective_notes: string | null;
          observed_reactions: string | null;
          plan: string | null;
          respiratory_rate_bpm: number | null;
          status: Database["public"]["Enums"]["note_status"];
          subjective: string | null;
          temperature: number | null;
          temperature_unit: string | null;
          updated_at: string;
          updated_by: string | null;
          weight: number | null;
          weight_unit: string | null;
        };
        ComputedFields: never;
        Insert: {
          amendment_reason?: string | null;
          assessment?: string | null;
          body_condition_scale?: number | null;
          body_condition_score?: number | null;
          created_at?: string;
          created_by?: string | null;
          encounter_id: string;
          exam_findings?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          fit_for_vaccination?: boolean | null;
          follow_up?: string | null;
          general_appearance?: string | null;
          heart_rate_bpm?: number | null;
          id?: string;
          objective_notes?: string | null;
          observed_reactions?: string | null;
          plan?: string | null;
          respiratory_rate_bpm?: number | null;
          status?: Database["public"]["Enums"]["note_status"];
          subjective?: string | null;
          temperature?: number | null;
          temperature_unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          weight?: number | null;
          weight_unit?: string | null;
        };
        Update: {
          amendment_reason?: string | null;
          assessment?: string | null;
          body_condition_scale?: number | null;
          body_condition_score?: number | null;
          created_at?: string;
          created_by?: string | null;
          encounter_id?: string;
          exam_findings?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          fit_for_vaccination?: boolean | null;
          follow_up?: string | null;
          general_appearance?: string | null;
          heart_rate_bpm?: number | null;
          id?: string;
          objective_notes?: string | null;
          observed_reactions?: string | null;
          plan?: string | null;
          respiratory_rate_bpm?: number | null;
          status?: Database["public"]["Enums"]["note_status"];
          subjective?: string | null;
          temperature?: number | null;
          temperature_unit?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          weight?: number | null;
          weight_unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "soap_notes_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: true;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_profiles: {
        Row: {
          active: boolean;
          created_at: string;
          credentials: string | null;
          email: string;
          full_name: string;
          license_number: string | null;
          license_state: string | null;
          role: Database["public"]["Enums"]["staff_role"];
          signature_path: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          credentials?: string | null;
          email: string;
          full_name: string;
          license_number?: string | null;
          license_state?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          signature_path?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          credentials?: string | null;
          email?: string;
          full_name?: string;
          license_number?: string | null;
          license_state?: string | null;
          role?: Database["public"]["Enums"]["staff_role"];
          signature_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      vaccinations: {
        Row: {
          administered_by: string | null;
          administered_by_name: string | null;
          administered_elsewhere: boolean;
          administered_on: string;
          adverse_reaction: string | null;
          correction_reason: string | null;
          created_at: string;
          created_by: string | null;
          duration_months: number | null;
          encounter_id: string | null;
          external_id: string | null;
          id: string;
          is_rabies: boolean;
          lot_expiration: string | null;
          lot_number: string | null;
          manufacturer: string | null;
          next_due_on: string | null;
          notes: string | null;
          owner_id: string;
          pet_id: string;
          product_id: string | null;
          rabies_tag_number: string | null;
          route: string | null;
          serial_number: string | null;
          site: string | null;
          source: Database["public"]["Enums"]["record_source"];
          status: Database["public"]["Enums"]["vaccination_status"];
          supersedes_id: string | null;
          vaccine_name: string;
          vaccine_type: string;
        };
        ComputedFields: never;
        Insert: {
          administered_by?: string | null;
          administered_by_name?: string | null;
          administered_elsewhere?: boolean;
          administered_on: string;
          adverse_reaction?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_months?: number | null;
          encounter_id?: string | null;
          external_id?: string | null;
          id?: string;
          is_rabies?: boolean;
          lot_expiration?: string | null;
          lot_number?: string | null;
          manufacturer?: string | null;
          next_due_on?: string | null;
          notes?: string | null;
          owner_id: string;
          pet_id: string;
          product_id?: string | null;
          rabies_tag_number?: string | null;
          route?: string | null;
          serial_number?: string | null;
          site?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["vaccination_status"];
          supersedes_id?: string | null;
          vaccine_name: string;
          vaccine_type: string;
        };
        Update: {
          administered_by?: string | null;
          administered_by_name?: string | null;
          administered_elsewhere?: boolean;
          administered_on?: string;
          adverse_reaction?: string | null;
          correction_reason?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_months?: number | null;
          encounter_id?: string | null;
          external_id?: string | null;
          id?: string;
          is_rabies?: boolean;
          lot_expiration?: string | null;
          lot_number?: string | null;
          manufacturer?: string | null;
          next_due_on?: string | null;
          notes?: string | null;
          owner_id?: string;
          pet_id?: string;
          product_id?: string | null;
          rabies_tag_number?: string | null;
          route?: string | null;
          serial_number?: string | null;
          site?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: Database["public"]["Enums"]["vaccination_status"];
          supersedes_id?: string | null;
          vaccine_name?: string;
          vaccine_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vaccinations_administered_by_fkey";
            columns: ["administered_by"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "vaccinations_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_pet_id_fkey";
            columns: ["pet_id"];
            isOneToOne: false;
            referencedRelation: "pets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "vaccine_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vaccinations_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "vaccinations";
            referencedColumns: ["id"];
          },
        ];
      };
      vaccine_products: {
        Row: {
          active: boolean;
          created_at: string;
          default_interval_months: number | null;
          default_route: string | null;
          default_site: string | null;
          id: string;
          is_rabies: boolean;
          manufacturer: string | null;
          name: string;
          species: Database["public"]["Enums"]["species"];
          vaccine_type: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          default_interval_months?: number | null;
          default_route?: string | null;
          default_site?: string | null;
          id?: string;
          is_rabies?: boolean;
          manufacturer?: string | null;
          name: string;
          species: Database["public"]["Enums"]["species"];
          vaccine_type: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          default_interval_months?: number | null;
          default_route?: string | null;
          default_site?: string | null;
          id?: string;
          is_rabies?: boolean;
          manufacturer?: string | null;
          name?: string;
          species?: Database["public"]["Enums"]["species"];
          vaccine_type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      next_certificate_number: { Args: Record<PropertyKey, never>; Returns: string };
      publish_form_version: { Args: { p_version_id: string }; Returns: undefined };
    };
    Enums: {
      appointment_status: "requested" | "confirmed" | "completed" | "canceled";
      certificate_status: "issued" | "voided";
      contact_method: "email" | "phone" | "text";
      form_kind: "intake" | "consent" | "intake_consent";
      form_version_status: "draft" | "published" | "retired";
      note_status: "draft" | "final" | "amended";
      pet_sex: "male" | "female" | "unknown";
      record_source: "petvax" | "jotform" | "staff";
      review_status: "ok" | "needs_review" | "merged";
      species: "dog" | "cat" | "other";
      staff_role: "admin" | "vet" | "staff";
      submission_status: "received" | "processed" | "needs_review" | "error";
      vaccination_status: "active" | "superseded" | "voided";
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
      appointment_status: ["requested", "confirmed", "completed", "canceled"],
      certificate_status: ["issued", "voided"],
      contact_method: ["email", "phone", "text"],
      form_kind: ["intake", "consent", "intake_consent"],
      form_version_status: ["draft", "published", "retired"],
      note_status: ["draft", "final", "amended"],
      pet_sex: ["male", "female", "unknown"],
      record_source: ["petvax", "jotform", "staff"],
      review_status: ["ok", "needs_review", "merged"],
      species: ["dog", "cat", "other"],
      staff_role: ["admin", "vet", "staff"],
      submission_status: ["received", "processed", "needs_review", "error"],
      vaccination_status: ["active", "superseded", "voided"],
    },
  },
} as const;
