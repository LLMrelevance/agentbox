// Where the sign-in is kept: the keychain on a phone, the page's own storage
// in the browser preview. Only the two keys the sign-in client writes.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Persist } from '../lib/kept';

const KEYS = ['agentbox-cloud-session', 'agentbox-cloud-verifier'];

export const persist: Persist = Platform.OS === 'web'
  ? {
    read: async () => Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null) as [string, string][]),
    write: async (key, value) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); },
  }
  : {
    read: async () => {
      const out: Record<string, string> = {};
      for (const k of KEYS) { const v = await SecureStore.getItemAsync(k); if (v !== null) out[k] = v; }
      return out;
    },
    write: async (key, value) => {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    },
  };
