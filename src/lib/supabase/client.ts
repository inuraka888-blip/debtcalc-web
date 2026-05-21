import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabasePublishableKey || "placeholder-publishable-key",
);

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }

  return data.user;
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
