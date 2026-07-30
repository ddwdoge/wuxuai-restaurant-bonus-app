import { createClient } from "@supabase/supabase-js";
import { deriveSupabaseAuthStorageKey } from "../../modules/auth/authSessionGuard.mjs";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl?.includes("your-project") &&
  supabaseAnonKey !== "your-anon-key";

export const liveDataUnavailableMessage =
  "Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.";

export const supabaseAuthStorageKey = supabaseUrl ? deriveSupabaseAuthStorageKey(supabaseUrl) : null;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

export const ownerRecoverySupabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage: window.sessionStorage,
        storageKey: "wuxuai-owner-recovery-auth",
      },
    })
  : null;
