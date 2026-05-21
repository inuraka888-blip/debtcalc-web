import type { Event } from "@/domain/models";
import { CloudEventRepository } from "@/lib/cloud/CloudEventRepository";
import { supabase } from "@/lib/supabase/client";

interface SharedEventBlobRow {
  id: string;
  event_data: Event;
  remote_event_id: string | null;
}

export async function migrateSharedEventBlobToNormalized(sharedEventId: string): Promise<string> {
  const { data, error } = await supabase
    .from("events_shared")
    .select("id, event_data, remote_event_id")
    .eq("id", sharedEventId)
    .single<SharedEventBlobRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (data.remote_event_id) {
    return data.remote_event_id;
  }

  const snapshot = await new CloudEventRepository().createEvent(data.event_data);
  const { error: updateError } = await supabase
    .from("events_shared")
    .update({ remote_event_id: snapshot.remoteEventId })
    .eq("id", sharedEventId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return snapshot.remoteEventId;
}
