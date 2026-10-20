// Alerts on the lock screen (docs/mobile/PLAN.md, phase 1 proves one arrives).
// The sender in the cloud is phase 3; until then the phone asks Expo's push
// service to send it one test alert, which proves the whole road from a
// server to the lock screen.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export const alertsHere = Platform.OS !== 'web';

export async function alertToken(): Promise<string> {
  if (!Device.isDevice) throw new Error('Alerts need the app on a phone.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Threads', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Alerts are off for this app in Settings.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('This build has no Expo project, so it cannot get alerts.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function sendTestAlert(token: string, request: Fetch) {
  const res = await request('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to: token, title: 'Agentbox', body: 'A test alert. Threads that need you will arrive like this.', sound: 'default' }),
  });
  const said = await res.json().catch(() => null);
  if (!res.ok || said?.data?.status === 'error') throw new Error(said?.data?.message ?? 'Expo did not send the alert.');
}
