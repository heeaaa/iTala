import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Local notifications for game reminders and final scores. "Local" means the
// device schedules them itself (no server/push infrastructure needed) — enough
// for "your team plays soon" and "final score" nudges tied to favorites.
// Push (remote) notifications would need a server; this is the pragmatic first
// step that works entirely on-device.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let granted = false;

export async function ensureNotifPermission(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    granted = status === 'granted';
    if (granted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('games', {
        name: 'Game alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    return granted;
  } catch {
    return false;
  }
}

// Fire a simple notification now (e.g. a final score for a favorited team).
export async function notifyNow(title: string, body: string): Promise<void> {
  if (!granted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // immediately
    });
  } catch { /* best-effort */ }
}
