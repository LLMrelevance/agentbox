// Settings: who is signed in, alerts, and signing out. Deleting the account,
// the AI notice and the privacy policy join it before the App Store (PLAN.md).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { withDeadline } from '../lib/deadline';
import { alertsHere, alertToken, sendTestAlert } from '../platform/alerts';
import { useCloud } from '../state/cloud';
import { Back } from '../ui/icons';
import { Button, IconButton, T, TopBar, Wall } from '../ui/parts';
import { color, size } from '../ui/theme';

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ gap: 12, paddingVertical: 20, borderBottomWidth: last ? 0 : 1, borderBottomColor: color.line }}>
      <T style={{ fontSize: 13, color: color.dim }}>{title}</T>
      {children}
    </View>
  );
}

export default function Settings() {
  const c = useCloud();
  const [token, setToken] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const attempt = (fn: () => Promise<void>) => async () => {
    setBusy(true); setSaid(null);
    try { await fn(); } catch (err) { setSaid(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };

  return (
    <Wall>
      <TopBar left={<IconButton label="Back" onPress={back}><Back /></IconButton>} title="Settings" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 40 }}>
        <Section title="Signed in as">
          <T style={{ fontSize: 16 }}>{c.cloud?.session()?.user.email ?? ''}</T>
        </Section>
        <Section title="Alerts">
          {!alertsHere ? <T style={{ fontSize: 15, color: color.dim }}>Alerts need the app on your phone.</T>
            : token ? (
              <>
                <T style={{ fontSize: 15, color: color.dim }}>Alerts are on for this phone.</T>
                <Button title="Send a test alert" disabled={busy} onPress={attempt(async () => { await sendTestAlert(token, withDeadline(fetch)); setSaid('Sent. Lock your phone to see it arrive.'); })} />
              </>
            ) : <Button title="Turn on alerts" disabled={busy} onPress={attempt(async () => setToken(await alertToken()))} />}
          {said && <T style={{ fontSize: 14, color: color.dim }}>{said}</T>}
        </Section>
        <Section title="This phone" last>
          <Button title="Sign out" onPress={() => { c.signOut(); router.replace('/sign-in'); }} />
        </Section>
        <T style={{ fontSize: 12, color: color.faint, paddingTop: 16 }}>Version {Constants.expoConfig?.version}</T>
      </ScrollView>
    </Wall>
  );
}
