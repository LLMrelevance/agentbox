// Sign in, in the phone site's words (renderer/src/team/SignInPage.tsx), with
// Sign in with Apple first on an iPhone (guideline 4.8).
import * as AppleAuthentication from 'expo-apple-authentication';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Name } from '../../../shared/product-name.mjs';
import { appleAvailable, appleSignIn, googleSignIn } from '../platform/sign-in';
import { useCloud } from '../state/cloud';
import { Button, T, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

function Field({ label, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <T style={{ fontSize: 13, color: color.dim }}>{label}</T>
      <TextInput placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} {...rest}
        style={{ height: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong, fontFamily: font.regular, fontSize: 16, color: color.text }} />
    </View>
  );
}

export default function SignIn() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [apple, setApple] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void appleAvailable().then(setApple); }, []);
  if (c.signedIn) return <Redirect href="/" />;

  const run = (which: string, how: () => Promise<unknown>) => async () => {
    if (!c.cloud) return;
    setBusy(which); setError(null);
    try { await c.signedInWith(how); } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED') setError(String(err?.message ?? err) || 'That did not work. Try again.');
    } finally { setBusy(null); }
  };

  return (
    <Wall>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: inset.top + 24, paddingBottom: inset.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8, marginBottom: 18 }}>
            <T style={{ fontFamily: font.medium, fontSize: 24, letterSpacing: -0.3 }}>Sign in to {Name}</T>
            <T style={{ fontSize: 15, lineHeight: 22, color: color.dim }}>Use the account your computer is signed in with. Your threads are here even when it is closed.</T>
          </View>
          {!c.cloud && !c.preview && <T style={{ fontSize: 14, color: color.dim }}>This build was made without the cloud's address, so it cannot sign in.</T>}
          {apple && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={0} style={{ height: 48 }}
              onPress={run('apple', () => appleSignIn(c.cloud!))} />
          )}
          <Button title={busy === 'google' ? 'Signing in…' : 'Continue with Google'} disabled={!!busy || !c.cloud} onPress={run('google', () => googleSignIn(c.cloud!))} />
          <T style={{ textAlign: 'center', fontSize: 13, color: color.faint, marginVertical: 4 }}>or</T>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" />
          <Button title={busy === 'email' ? 'Signing in…' : 'Sign in'} disabled={!email.trim() || !password || !!busy || !c.cloud}
            onPress={run('email', () => c.cloud!.signInWithPassword(email.trim(), password))} style={{ marginTop: 6 }} />
          {error && <T style={{ fontSize: 14, color: color.dim }} accessibilityRole="alert">{error}</T>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Wall>
  );
}
