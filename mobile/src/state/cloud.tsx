// The app's one connection to the online inbox, and the rows it last read.
// It reads the way the phone site does (renderer/src/cloud-bridge.ts): every
// five seconds while the app is in front, one read at a time, only the
// threads that changed, and at once on coming back to the front.
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { cloudClient, type CloudClient } from '../../../renderer/src/cloud-rest';
import { macSeenOf, phoneStatusLine, phoneView, readCommands, readThreads, type PhoneRows } from '../../../renderer/src/phone-rows';
import { commandForPress, type Press } from '../lib/actions';
import { withDeadline } from '../lib/deadline';
import { keptStore } from '../lib/kept';
import { previewCloud } from '../lib/preview';
import { phoneTabs } from '../lib/tabs';
import { persist } from '../platform/persist';

export type Cloud = Pick<CloudClient, 'session' | 'signedIn' | 'generation' | 'select' | 'insertCommand' | 'signInWithPassword' | 'signInWithIdToken' | 'googleUrl' | 'finishGoogle' | 'signOut'>;

const EMPTY: PhoneRows = { projects: [], threads: [], commands: [] };
const EVERY_MS = 5000;
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

async function openCloud(): Promise<Cloud | null> {
  if (PREVIEW) return previewCloud();
  const cfg = Constants.expoConfig?.extra?.cloud;
  if (!cfg?.url || !cfg?.anonKey) return null;
  return cloudClient(cfg, { storage: await keptStore(persist), fetchImpl: withDeadline(fetch) });
}

function useCloudState() {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [opened, setOpened] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRows] = useState<PhoneRows>(EMPTY);
  const [read, setRead] = useState({ error: null as string | null, fetchedAt: 0, first: true });
  const [now, setNow] = useState(Date.now());
  const cache = useRef(new Map<string, PhoneRows['threads'][number]>());
  const reading = useRef<Promise<void> | null>(null);

  useEffect(() => {
    openCloud().then((c) => { setCloud(c); setSignedIn(!!c?.signedIn()); setOpened(true); }, () => setOpened(true));
  }, []);

  const refresh = useCallback(() => {
    if (!cloud || reading.current) return reading.current ?? Promise.resolve();
    reading.current = (async () => {
      if (!cloud.signedIn()) { setSignedIn(false); setRows(EMPTY); return; }
      const asked = cloud.generation();
      const select = (table: string, query: string) => cloud.select(table, query);
      try {
        const [projects, threads, commands] = await Promise.all([
          select('phone_projects', 'select=device,project,name,updated_at&order=name'),
          readThreads(select, cache.current),
          readCommands(select),
        ]);
        if (cloud.generation() !== asked) { cache.current.clear(); return; }
        setRows({ projects, threads, commands });
        setRead({ error: null, fetchedAt: Date.now(), first: false });
      } catch (err) {
        if (cloud.generation() !== asked) return;
        if (!cloud.signedIn()) { setSignedIn(false); setRows(EMPTY); }
        setRead((r) => ({ ...r, error: String((err as Error)?.message ?? err), first: false }));
      } finally {
        setNow(Date.now());
      }
    })().finally(() => { reading.current = null; });
    return reading.current;
  }, [cloud]);

  useEffect(() => {
    if (!cloud || !signedIn) return;
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [cloud, signedIn, refresh]);

  const view = useMemo(() => phoneView(rows, now), [rows, now]);
  const tabs = useMemo(() => phoneTabs(view, now), [view, now]);
  const status = signedIn ? phoneStatusLine({ error: read.error, fetchedAt: read.fetchedAt, macSeen: macSeenOf(rows.projects) }, now) : null;

  const send = useCallback(async (press: Press, item: { product: string; id: string; status: string }) => {
    if (!cloud) return;
    const cmd = commandForPress(press, item, view.aliases);
    if (!cmd) return;
    const row = await cloud.insertCommand(cmd);
    setRows((r) => ({ ...r, commands: [...r.commands, row] }));
    setNow(Date.now());
  }, [cloud, view.aliases]);

  const signedInWith = useCallback(async (how: () => Promise<unknown>) => {
    const out = await how();
    if (out !== null) { setSignedIn(!!cloud?.signedIn()); setRead({ error: null, fetchedAt: 0, first: true }); }
  }, [cloud]);

  const signOut = useCallback(() => {
    cloud?.signOut();
    cache.current.clear();
    setRows(EMPTY);
    setSignedIn(false);
  }, [cloud]);

  return { cloud, opened, signedIn, rows, view, tabs, status, loading: read.first, now, refresh, send, signedInWith, signOut, preview: PREVIEW };
}

type CloudState = ReturnType<typeof useCloudState>;
const Ctx = createContext<CloudState | null>(null);

export function CloudProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useCloudState()}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
