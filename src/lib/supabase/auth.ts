import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./client";

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

export async function signInWithMagicLink(email: string, redirectTo?: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
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

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): { unsubscribe: () => void } {
  if (!isSupabaseConfigured()) {
    return { unsubscribe: () => undefined };
  }

  const { data } = supabase.auth.onAuthStateChange(callback);
  return {
    unsubscribe: () => data.subscription.unsubscribe(),
  };
}
