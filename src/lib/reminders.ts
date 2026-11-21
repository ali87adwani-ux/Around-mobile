/**
 * Local reminders one hour before a booking or game. No server needed; not available on web.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export const remindersSupported = Platform.OS !== 'web';

async function ensurePermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Schedules a reminder `minutesBefore` a Kuwait-local date/hour. Returns the notification id, if scheduled. */
export async function scheduleReminder(title: string, body: string, dateISO: string, hour: number, minutesBefore = 60): Promise<string | undefined> {
  if (!remindersSupported) return undefined;
  const at = new Date(`${dateISO}T${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}:00+03:00`).getTime() - minutesBefore * 60000;
  if (at <= Date.now() + 60000) return undefined;
  if (!(await ensurePermission())) return undefined;
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

export async function cancelReminder(id?: string) {
  if (!remindersSupported || !id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
