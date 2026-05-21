export type NotificationPermissionState = "unsupported" | NotificationPermission;

export interface PushNotificationProvider {
  subscribe(): Promise<void>;
  unsubscribe(): Promise<void>;
  sendReminder(reminderId: string): Promise<void>;
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return;
  }

  new Notification(title, options);
}

// Future push architecture:
// A backend/service-worker provider can implement PushNotificationProvider to subscribe
// devices, persist push subscriptions, and send reminders when the browser is closed.
// The current MVP intentionally only uses local browser notifications while the app is open.
