import type { Event, EventId } from "@/domain/models";

export type RemoteEventPermission = "owner" | "editor" | "viewer";

export interface CollaborativeEventLink {
  remoteEventId: string;
  permission: RemoteEventPermission;
}

export interface EventPresenceMember {
  id: string;
  email: string;
  joinedAt: string;
}

export interface RealtimeEventSnapshot {
  event: Event;
  remoteEventId: string;
  permission: RemoteEventPermission;
}

export interface RemoteEventSaveRequest {
  eventId: EventId;
  remoteEventId: string;
  event: Event;
  previousEvent: Event;
}
