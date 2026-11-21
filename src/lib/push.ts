/**
 * Phone push notifications (Expo push service). The database sends them; the app only registers
 * this phone's push token for the signed-in user. Needs a development or store build with an
 * EAS project id; on web and in Expo Go it quietly does nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as api from './api';

const TOKEN_KEY = 'aldawri.pushToken';
export const pushSupported = Platform.OS !== 'web';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/** Asks for permission (once) and links this phone to the signed-in account. */
export async function registerForPush(lang: string): Promise<boolean> {
  if (!pushSupported) return false;
  const id = projectId();
  if (!id) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Al Dawri', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0B2E6F' });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.registerPushToken(token, Platform.OS, lang);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Stops pushes to this phone (on sign-out or account deletion). */
export async function unregisterPush() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await api.unregisterPushToken(token).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY);
}
