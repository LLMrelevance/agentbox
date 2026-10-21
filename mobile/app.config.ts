// The phone app's configuration (docs/mobile/PLAN.md).
//
// The cloud's public address and key come from the same file the phone site
// reads (scripts/phone-site-config.mjs), or from the environment on Expo's
// build machines, which see only what git tracks. Neither is committed. The
// bundle id is permanent once a build uses it, so it is the owner's to choose
// and comes from the environment too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';
import { NAME, nameSlug } from '../shared/product-name.mjs';

function cloudConfig(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_CLOUD_URL;
  const anonKey = process.env.EXPO_PUBLIC_CLOUD_KEY;
  if (url && anonKey) return { url, anonKey };
  for (const file of [path.join(__dirname, '..', 'cloud', 'team.config.json'), path.join(os.homedir(), `.${nameSlug}`, 'team.config.json')]) {
    if (!fs.existsSync(file)) continue;
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c?.url === 'string' && typeof c?.anonKey === 'string') return { url: c.url, anonKey: c.anonKey };
  }
  return null;
}

const bundleId = process.env.MOBILE_BUNDLE_ID;
const projectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: NAME,
  slug: nameSlug,
  scheme: nameSlug,
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#1a1817',
  ios: {
    // iPhone only; it still runs in an iPad's iPhone mode, where reviewers sometimes test.
    supportsTablet: false,
    ...(bundleId ? { bundleIdentifier: bundleId } : {}),
    usesAppleSignIn: true,
    // HTTPS through the system is exempt from export rules.
    config: { usesNonExemptEncryption: false },
  },
  // Android's own icon shapes wait for its phase (docs/mobile/PLAN.md).
  android: { ...(bundleId ? { package: bundleId } : {}) },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    ['expo-notifications', { color: '#ee6018' }],
    // Apple shows these words when the app first asks; the camera is never asked for.
    ['expo-image-picker', { photosPermission: 'Pick a photo or video to attach to a message for your agent.', cameraPermission: false, microphonePermission: false }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    cloud: cloudConfig(),
    ...(projectId ? { eas: { projectId } } : {}),
  },
};

export default config;
