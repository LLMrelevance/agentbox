// The app's one connection to the online inbox, and the rows it last read.
// It reads the way the phone site does (renderer/src/cloud-bridge.ts): every
// five seconds while the app is in front, one read at a time, only the
// threads that changed, and at once on coming back to the front. It sends
// through the site's own doors (renderer/src/phone-send.ts) and signs her
// files' links the site's way (renderer/src/phone-links.ts).
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { cloudClient, type CloudClient } from '../../../renderer/src/cloud-rest';
import { macSeenOf, phoneSlug, phoneStatusLine, phoneView, readCommands, readThreads, splitSlug, type PhoneRows } from '../../../renderer/src/phone-rows';
import { phoneSender } from '../../../renderer/src/phone-send';
import { fileOnPhone, objectsToSign, renewLinks, type Links } from '../../../renderer/src/phone-links';
import { BUCKET, cloudPlaces } from '../../../renderer/src/cloud-files';
import { SEND_MAX_BYTES, sendFiles } from '../../../renderer/src/phone-sends-files';
import { toastParts } from '../../../renderer/src/toast-parts';
import type { Saved } from '../lib/attach';
import type { Picked } from '../platform/pick';
import { planFor, runSteps, type PressedItem, type Press } from '../lib/actions';
import { withDeadline } from '../lib/deadline';
import { keptStore } from '../lib/kept';
import { previewCloud } from '../lib/preview';
import { phoneTabs } from '../lib/tabs';
import { persist } from '../platform/persist';

export type Cloud = Pick<CloudClient, 'session' | 'signedIn' | 'generation' | 'select' | 'insertCommand' | 'update' | 'putFile' | 'signFiles' | 'signInWithPassword' | 'signInWithIdToken' | 'signUp' | 'googleUrl' | 'finishGoogle' | 'signOut' | 'insert' | 'remove' | 'rpc'>;

const EMPTY: PhoneRows = { projects: [], threads: [], commands: [] };
const EVERY_MS = 5000;
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

export interface Toast { key: number; line: string; undo: (() => Promise<void>) | null; goes?: { product: string; id: string } }

async function openCloud(): Promise<Cloud | null> {
  if (PREVIEW) return previewCloud();
  const cfg = Constants.expoConfig?.extra?.cloud;
  if (!cfg?.url || !cfg?.anonKey) return null;
  return cloudClient(cfg, { storage: await keptStore(persist), fetchImpl: withDeadline(fetch) });
}

const message = (err: unknown) => String((err as Error)?.message ?? err);

function useCloudState() {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [opened, setOpened] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRowsNow] = useState<PhoneRows>(EMPTY);
  const [read, setRead] = useState({ error: null as string | null, fetchedAt: 0, first: true });
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<Toast | null>(null);
  const cache = useRef(new Map<string, PhoneRows['threads'][number]>());
  const reading = useRef<Promise<void> | null>(null);
  // The sender reads and writes the newest rows, not the ones a render drew.
  const rowsNow = useRef<PhoneRows>(EMPTY);
  const setRows = useCallback((next: PhoneRows) => { rowsNow.current = next; setRowsNow(next); }, []);
  const links = useRef<Links>(new Map());
  const [signedAt, setSignedAt] = useState(0);

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
        // Links before the screens draw, so a picture is pointed at its file the moment it is drawn.
        const owner = cloud.session()?.user.id;
        const want = owner ? objectsToSign(cloudPlaces(threads, phoneSlug), commands, links.current, owner) : [];
        if (want.length) {
          await renewLinks((paths, seconds) => cloud.signFiles(BUCKET, paths, seconds), want, links.current, () => cloud.generation() === asked)
            .catch(() => { /* the pictures say missing, the words still read */ });
          setSignedAt(Date.now());
        }
      } catch (err) {
        if (cloud.generation() !== asked) return;
        if (!cloud.signedIn()) { setSignedIn(false); setRows(EMPTY); }
        setRead((r) => ({ ...r, error: message(err), first: false }));
      } finally {
        setNow(Date.now());
      }
    })().finally(() => { reading.current = null; });
    return reading.current;
  }, [cloud, setRows]);

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
  const aliases = useRef(view.aliases);
  aliases.current = view.aliases;

  const sender = useMemo(() => (cloud
    ? phoneSender({ client: cloud, rows: () => rowsNow.current, setRows, aliases: () => aliases.current, changed: () => setNow(Date.now()) })
    : null), [cloud, setRows]);

  /** Says `text` on the toast; its Undo, when the text offers one, runs `undo`. */
  const say = useCallback((text: string, undo?: () => Promise<void>, goes?: Toast['goes']) => {
    const { line, undo: offers } = toastParts(text);
    setToast({ key: Date.now(), line, undo: offers && undo ? undo : null, goes });
  }, []);

  /**
   * One press, sent as the site sends it. Resolves to what the first door
   * answered (the made row, for a new thread); throws what went wrong.
   * `undone` runs after its Undo has worked, to put the words back.
   */
  const send = useCallback(async (press: Press, item: PressedItem | null, opts: { undone?: () => void } = {}) => {
    if (!sender) return null;
    const plan = planFor(press, item, Date.now());
    if (!plan) return null;
    const made = await runSteps(sender, plan.steps);
    if (made && typeof made === 'object' && 'ok' in made && made.ok === false) throw new Error(String((made as { error?: string }).error ?? 'Not sent.'));
    if (plan.toast) {
      const goes = item ? { product: item.product, id: item.id } : made?.id ? { product: made.product, id: made.id } : undefined;
      say(plan.toast, plan.undo ? async () => {
        try {
          await runSteps(sender, plan.undo!(made));
          opts.undone?.();
          say(plan.undone?.(made) ?? 'Undone');
        } catch (err) { say(message(err)); }
      } : undefined, goes);
    }
    setNow(Date.now());
    return made;
  }, [sender, say]);

  // Files go to your own storage, in the folder of the computer the project is
  // on, as the phone site sends them; the message then links them.
  const attach = useCallback(async (product: string, files: Picked[]): Promise<Saved[]> => {
    const where = splitSlug(product);
    const owner = cloud?.session()?.user.id;
    if (!cloud || !where || !owner || !files.length) return [];
    return sendFiles({ put: (object, bytes, type) => cloud.putFile(BUCKET, object, bytes, type), owner, device: where.device, files, maxBytes: SEND_MAX_BYTES });
  }, [cloud]);

  /** A file a thread names: its link, or why the phone cannot open it. */
  const fileOf = useCallback((product: string, src: string) => fileOnPhone(view.places, links.current, product, src),
    // `signedAt` is when new links came in, so a picture still arriving is looked up again.
    [view.places, signedAt]);

  const signedInWith = useCallback(async (how: () => Promise<unknown>) => {
    const out = await how();
    if (out !== null) { setSignedIn(!!cloud?.signedIn()); setRead({ error: null, fetchedAt: 0, first: true }); }
  }, [cloud]);

  const signOut = useCallback(() => {
    cloud?.signOut();
    cache.current.clear();
    links.current.clear();
    setRows(EMPTY);
    setToast(null);
    setSignedIn(false);
  }, [cloud, setRows]);

  return {
    cloud, opened, signedIn, rows, view, tabs, status, loading: read.first, now, refresh, send, attach, fileOf, toast, say,
    dismissToast: () => setToast(null), signedInWith, signOut, preview: PREVIEW,
    // The one map of her files' links, filled in place; `signedAt` moves when it does.
    links: links.current, signedAt,
  };
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
