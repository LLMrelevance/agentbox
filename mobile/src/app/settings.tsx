// Settings, as the phone layout draws the desktop's (`.set-*`): a way back,
// the page's title, and plates of rows, each a label, a line under it and a
// small button. Deleting the account, the AI notice and the privacy policy
// join it before the App Store (docs/mobile/PLAN.md).
import Constants from 'expo-constants';
import { Redirect, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withDeadline } from '../lib/deadline';
import { screenGate } from '../lib/thread-gate';
import { alertsHere, alertToken, sendTestAlert } from '../platform/alerts';
import { useCloud } from '../state/cloud';
import { Back } from '../ui/icons';
import { Ghost, T, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 40 }}>
      {label && <T style={{ fontSize: 14, fontFamily: font.medium, letterSpacing: -0.07, paddingBottom: 12 }}>{label}</T>}
      <View style={{ backgroundColor: color.fill, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingHorizontal: 18 }}>{children}</View>
    </View>
  );
}

function Row({ label, desc, control, first = true }: { label: string; desc?: string; control?: ReactNode; first?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: color.line }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontSize: 13.5, fontFamily: font.medium, letterSpacing: -0.04 }}>{label}</T>
        {desc && <T style={{ fontSize: 12.5, lineHeight: 18.75, color: color.faint, marginTop: 3 }}>{desc}</T>}
      </View>
      {control}
    </View>
  );
}

export default function Settings() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const attempt = (fn: () => Promise<void>) => async () => {
    setBusy(true); setSaid(null);
    try { await fn(); } catch (err) { setSaid(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };
  const gate = screenGate(c);
  if (gate === 'wait') return <Wall><View /></Wall>;
  if (gate === 'sign-in') return <Redirect href="/sign-in" />;

  return (
    <Wall>
      <View style={{ paddingTop: inset.top }}>
        <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: size.inset, paddingRight: 8 }}>
          <Pressable onPress={back} accessibilityRole="button" style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }}>
            <Back size={14} />
            <T style={{ fontSize: 13, letterSpacing: 0.52, color: color.dim }}>Back to app</T>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingHorizontal: size.inset, paddingBottom: 120 }}>
        <T style={{ fontSize: 24, lineHeight: 31, letterSpacing: -0.84 }}>Settings</T>
        <Group>
          <Row label="Signed in" desc={c.cloud?.session()?.user.email ?? ''} control={<Ghost title="Sign out" onPress={() => { c.signOut(); router.replace('/sign-in'); }} />} />
        </Group>
        <Group label="Alerts">
          {!alertsHere
            ? <Row label="Alerts on this phone" desc="Alerts need the app on your phone." />
            : token
              ? <>
                <Row label="Alerts on this phone" desc="On. A thread that needs you arrives on the lock screen." />
                <Row first={false} label="Send a test alert" desc={said ?? 'Lock your phone after sending to see it arrive.'} control={<Ghost title="Send" disabled={busy} onPress={attempt(async () => { await sendTestAlert(token, withDeadline(fetch)); setSaid('Sent. Lock your phone to see it arrive.'); })} />} />
              </>
              : <Row label="Alerts on this phone" desc={said ?? 'A thread that needs you arrives on the lock screen.'} control={<Ghost title="Turn on" disabled={busy} onPress={attempt(async () => setToken(await alertToken()))} />} />}
        </Group>
        <T style={{ fontSize: 12.5, color: color.faint, marginTop: 40 }}>Version {Constants.expoConfig?.version}</T>
      </ScrollView>
    </Wall>
  );
}
