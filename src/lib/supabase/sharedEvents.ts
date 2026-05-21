import type { Event } from "@/domain/models";
import { shouldUseNormalizedCloudEvents } from "@/lib/cloud/config";
import { RemoteEventRepository } from "@/lib/realtime";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

export type SharePermission = "view" | "edit";

export interface SharedEventPayload {
  sharedEventId: string;
  remoteEventId?: string;
  event: Event;
  permission: SharePermission;
  expiresAt: string | null;
  version: number;
}

interface SharedEventRow {
  shared_event_id: string;
  remote_event_id: string | null;
  event_data: Event;
  permission: SharePermission;
  expires_at: string | null;
  version?: number;
}

interface EventsSharedRow {
  id: string;
  event_data: Event;
  version: number;
  updated_at: string;
}

export async function createEventShare({
  event,
  permission,
}: {
  event: Event;
  permission: SharePermission;
}): Promise<{ token: string; remoteEventId?: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(userError.message);
  }

  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("User is not authenticated.");
  }

  const remoteEvent = shouldUseNormalizedCloudEvents()
    ? await new RemoteEventRepository().ensureRemoteEvent(event)
    : undefined;

  const { data: sharedEvent, error: sharedEventError } = await supabase
    .from("events_shared")
    .insert({
      owner_id: userId,
      event_id: event.id,
      event_data: event,
      remote_event_id: remoteEvent?.remoteEventId ?? null,
      version: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (sharedEventError) {
    throw new Error(sharedEventError.message);
  }

  const token = createShareToken();
  const { error: shareError } = await supabase.from("event_shares").insert({
    shared_event_id: sharedEvent.id,
    token,
    permission,
  });

  if (shareError) {
    throw new Error(shareError.message);
  }

  return { token, remoteEventId: remoteEvent?.remoteEventId };
}

export async function loadSharedEvent(token: string): Promise<SharedEventPayload | null> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("get_shared_event_by_token", { p_token: token });

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as SharedEventRow[] | null)?.[0];
  if (!row) {
    return null;
  }

  return {
    sharedEventId: row.shared_event_id,
    remoteEventId: row.remote_event_id ?? undefined,
    event: row.event_data,
    permission: row.permission,
    expiresAt: row.expires_at,
    version: row.version ?? 1,
  };
}

export async function loadSharedEventById(sharedEventId: string): Promise<{
  event: Event;
  version: number;
  updatedAt: string;
} | null> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase
    .from("events_shared")
    .select("id, event_data, version, updated_at")
    .eq("id", sharedEventId)
    .maybeSingle<EventsSharedRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? {
        event: data.event_data,
        version: data.version,
        updatedAt: data.updated_at,
      }
    : null;
}

export async function saveSharedEvent({
  sharedEventId,
  event,
  nextVersion,
}: {
  sharedEventId: string;
  event: Event;
  nextVersion: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("events_shared")
    .update({
      event_data: event,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sharedEventId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function acceptSharedEvent(token: string): Promise<{
  remoteEventId: string;
  permission: "editor" | "viewer";
}> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.rpc("accept_event_share", { p_token: token });
  if (error) {
    throw new Error(error.message);
  }

  const row = (data as Array<{ remote_event_id: string; permission: "editor" | "viewer" }> | null)?.[0];
  if (!row) {
    throw new Error("Share link is invalid or expired.");
  }

  return {
    remoteEventId: row.remote_event_id,
    permission: row.permission,
  };
}

function createShareToken(): string {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
