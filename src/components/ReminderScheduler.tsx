"use client";

import { useEffect } from "react";
import { showLocalNotification } from "@/lib/notifications";
import { useEventsStore } from "@/store/eventsStore";

export function ReminderScheduler() {
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const reminders = useEventsStore((state) => state.reminders);
  const markReminderSent = useEventsStore((state) => state.markReminderSent);

  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    function checkDueReminders() {
      const now = Date.now();
      for (const reminder of reminders) {
        if (reminder.status !== "scheduled") {
          continue;
        }

        if (new Date(reminder.remindAt).getTime() <= now) {
          showLocalNotification(reminder.title, {
            body: reminder.message,
            tag: reminder.id,
          });
          markReminderSent(reminder.id);
        }
      }
    }

    checkDueReminders();
    const intervalId = window.setInterval(checkDueReminders, 60_000);
    return () => window.clearInterval(intervalId);
  }, [markReminderSent, reminders]);

  return null;
}
