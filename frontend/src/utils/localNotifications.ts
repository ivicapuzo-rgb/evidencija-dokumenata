import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { formatDate } from "@/src/utils/docmeta";
import { storage } from "@/src/utils/storage";

export const REMINDER_TIME_KEY = "reminder_time"; // "HH:MM"
export const DEFAULT_REMINDER_TIME = "09:00";

export async function getReminderTime(): Promise<string> {
  return storage.getItem<string>(REMINDER_TIME_KEY, DEFAULT_REMINDER_TIME);
}

export async function setReminderTime(value: string): Promise<void> {
  await storage.setItem(REMINDER_TIME_KEY, value);
}

function parseTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m };
}

export type DocLite = {
  id: string;
  name: string;
  expires_at: string;
  alarm_days: number;
  days_remaining: number;
};

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

// Schedules a LOCAL notification for every document at 09:00, `alarm_days`
// before it expires. These fire on the device even offline and appear on the
// lock screen + notification tray. Also sets the app-icon badge to the number
// of documents currently inside their alarm window.
export async function syncDocReminders(docs: DocLite[]): Promise<void> {
  if (Platform.OS === "web") return;
  const ok = await ensurePermission();
  if (!ok) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const { hour, minute } = parseTime(await getReminderTime());
  const now = new Date();
  let dueCount = 0;

  for (const d of docs) {
    if (d.days_remaining < 0) continue; // already expired — nothing to remind

    const [y, m, day] = d.expires_at.slice(0, 10).split("-").map(Number);
    if (!y || !m || !day) continue;

    // user-chosen time of day, `alarm_days` before the expiry date
    const notifyDate = new Date(y, m - 1, day, hour, minute, 0);
    notifyDate.setDate(notifyDate.getDate() - d.alarm_days);

    let triggerDate = notifyDate;
    if (notifyDate <= now) {
      // we're already inside the alarm window → fire shortly
      triggerDate = new Date(now.getTime() + 4000);
    }

    if (d.days_remaining <= d.alarm_days) dueCount += 1;

    await Notifications.scheduleNotificationAsync({
      identifier: `doc-${d.id}`,
      content: {
        title: "Документ ускоро истиче",
        body: `${d.name} истиче ${formatDate(d.expires_at)} — обновите на време.`,
        sound: "default",
        ...(Platform.OS === "ios" ? { badge: dueCount } : {}),
        data: { action_url: "/" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: "default",
      },
    });
  }

  try {
    await Notifications.setBadgeCountAsync(dueCount);
  } catch {
    /* ignore */
  }
}
