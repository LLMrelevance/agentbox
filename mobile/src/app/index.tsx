// Threads, as the phone layout draws them (renderer/src/phone.css): the four
// tabs as words along the bottom, each row its title over the project and
// age, and a new thread under the thumb.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TABS, type Row, type TabId } from '../lib/tabs';
import { useCloud } from '../state/cloud';
import { Cloud, Gear, Pen, Tick } from '../ui/icons';
import { IconButton, RunningMark, T, TopBar, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

// The desktop's own words for an empty tab (renderer/src/threads/Pages.tsx `EmptyTab`).
const EMPTY: Record<TabId, string> = {
  inbox: 'Nothing needs you',
  progress: 'Nothing is running.',
  snoozed: 'Nothing is waiting for later. "Add it to Later" on a new thread writes one down without starting it.',
  done: 'Nothing closed yet. A finished thread waits in Needs you until you close it.',
};

function ThreadRow({ row, first }: { row: Row; first: boolean }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: row.product, id: row.id } })}
      style={({ pressed }) => ({ minHeight: 64, paddingTop: 14, paddingBottom: 14, paddingLeft: size.inset, paddingRight: 12, backgroundColor: pressed ? color.fill : 'transparent' })}>
      {/* The line over every row but the first, edge to 12px short of the right (`.row + .row::after`). */}
      {!first && <View style={{ position: 'absolute', top: 0, left: 0, right: 12, height: 1, backgroundColor: color.rowLine }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {row.running && <View style={{ marginRight: row.cloud ? 6 : 8 }}><RunningMark cloud={row.cloud}><Cloud /></RunningMark></View>}
        <T numberOfLines={2} style={{ flex: 1, fontSize: 16, lineHeight: 21.6, letterSpacing: -0.16 }}>{row.title}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
        <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 20, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{row.projectName}</T>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.faint }}>·</T>
        <T style={{ fontSize: 11, lineHeight: 20, color: color.faint }}>{row.when}</T>
      </View>
    </Pressable>
  );
}

function Tabs({ on, counts, pick, foot }: { on: TabId; counts: Record<TabId, number>; pick: (t: TabId) => void; foot: number }) {
  return (
    <View style={{ height: size.tabs + foot, paddingBottom: foot, borderTopWidth: 1, borderTopColor: color.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: size.inset, gap: 22 }}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => pick(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on === t.id }}
            style={{ height: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: on === t.id ? color.accent : 'transparent' }}>
            <T style={{ fontSize: 15, lineHeight: 30, color: on === t.id ? color.text : color.dim }}>{t.label}</T>
            {t.id !== 'done' && counts[t.id] > 0 && <T style={{ fontSize: 11, lineHeight: 30, fontFamily: font.medium, marginLeft: 13, color: color.faint }}>{counts[t.id]}</T>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Threads() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('inbox');
  const [pulling, setPulling] = useState(false);
  if (!c.opened) return <Wall><View /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  const rows = c.tabs[tab];
  const counts = { inbox: c.tabs.inbox.length, progress: c.tabs.progress.length, snoozed: c.tabs.snoozed.length, done: c.tabs.done.length };
  // The home bar's room under the tabs, never under 8px (phone.css `--phone-foot`).
  const foot = Math.max(8, inset.bottom - 14);
  return (
    <Wall>
      <TopBar title="Threads" right={<IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>} />
      {/* `.phone-status` (threads/pages.css): the line saying what you see may be out of date. */}
      {c.status && (
        <View accessibilityRole="alert" style={{ marginTop: 6, marginHorizontal: size.inset, marginBottom: 2, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: color.lineStrong }}>
          <T style={{ fontSize: 13, lineHeight: 18.2, color: color.dim }}>{c.status}</T>
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item, index }) => <ThreadRow row={item} first={index === 0} />}
        refreshControl={<RefreshControl tintColor={color.dim} refreshing={pulling} onRefresh={async () => { setPulling(true); await c.refresh(); setPulling(false); }} />}
        ListEmptyComponent={c.loading ? undefined : (
          <View style={{ paddingHorizontal: size.inset, paddingTop: 28, gap: 12 }}>
            {tab === 'inbox' && <Tick />}
            <T style={{ fontSize: tab === 'inbox' ? 17 : 15, lineHeight: 23, color: tab === 'inbox' ? color.text : color.dim }}>{EMPTY[tab]}</T>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <Pressable accessibilityLabel="New thread" accessibilityRole="button" onPress={() => router.push('/new')}
        style={({ pressed }) => ({
          position: 'absolute', right: 20, bottom: size.tabs + foot + 16, width: 56, height: 56, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center', backgroundColor: color.graphite, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, opacity: pressed ? 0.85 : 1,
        })}>
        <Pen />
      </Pressable>
      <Tabs on={tab} counts={counts} pick={setTab} foot={foot} />
    </Wall>
  );
}
