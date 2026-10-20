// Threads: the desktop's four tabs as words along the bottom, under the thumb
// (renderer/src/phone.css), and each row its title over the project and age.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TABS, type Row, type TabId } from '../lib/tabs';
import { useCloud } from '../state/cloud';
import { Gear, Tick } from '../ui/icons';
import { IconButton, T, TopBar, Wall } from '../ui/parts';
import { color, font, size } from '../ui/theme';

// The desktop's own words for an empty tab (renderer/src/threads/Pages.tsx `EmptyTab`).
const EMPTY: Record<TabId, string> = {
  inbox: 'Nothing needs you',
  progress: 'Nothing is running.',
  snoozed: 'Nothing is waiting for later.',
  done: 'Nothing closed yet. A finished thread waits in Needs you until you close it.',
};

function ThreadRow({ row }: { row: Row }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/thread/[product]/[id]', params: { product: row.product, id: row.id } })}
      style={({ pressed }) => ({ minHeight: 64, paddingVertical: 14, paddingHorizontal: size.inset, backgroundColor: pressed ? 'rgba(255,255,255,0.04)' : 'transparent' })}>
      <T numberOfLines={2} style={{ fontSize: 16, lineHeight: 21.6 }}>{row.title}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
        {row.running && <View style={{ width: 6, height: 6, backgroundColor: color.accent }} />}
        <T numberOfLines={1} style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim, flexShrink: 1 }}>{row.projectName}</T>
        <T style={{ fontSize: 11, color: color.faint }}>·</T>
        <T style={{ fontSize: 11, color: color.faint }}>{row.when}</T>
      </View>
    </Pressable>
  );
}

function Tabs({ on, counts, pick }: { on: TabId; counts: Record<TabId, number>; pick: (t: TabId) => void }) {
  const inset = useSafeAreaInsets();
  const foot = Math.max(8, inset.bottom - 14);
  return (
    <View style={{ height: size.tabs + foot, paddingBottom: foot, backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: size.inset, gap: 22 }}>
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => pick(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on === t.id }}
            style={{ height: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: on === t.id ? color.accent : 'transparent' }}>
            <T style={{ fontSize: 15, color: on === t.id ? color.text : color.dim }}>{t.label}</T>
            {t.id !== 'done' && counts[t.id] > 0 && <T style={{ fontSize: 11, fontFamily: font.medium, marginLeft: 5, color: color.faint }}>{counts[t.id]}</T>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Threads() {
  const c = useCloud();
  const [tab, setTab] = useState<TabId>('inbox');
  const [pulling, setPulling] = useState(false);
  if (!c.opened) return <Wall><View /></Wall>;
  if (!c.signedIn) return <Redirect href="/sign-in" />;
  const rows = c.tabs[tab];
  const counts = { inbox: c.tabs.inbox.length, progress: c.tabs.progress.length, snoozed: c.tabs.snoozed.length, done: c.tabs.done.length };
  return (
    <Wall>
      <TopBar title="Threads" right={<IconButton label="Settings" onPress={() => router.push('/settings')}><Gear /></IconButton>} />
      {c.status && <T style={{ fontSize: 13, color: color.dim, paddingHorizontal: size.inset, paddingBottom: 10 }}>{c.status}</T>}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => <ThreadRow row={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: size.inset, backgroundColor: color.line }} />}
        refreshControl={<RefreshControl tintColor={color.dim} refreshing={pulling} onRefresh={async () => { setPulling(true); await c.refresh(); setPulling(false); }} />}
        ListEmptyComponent={c.loading ? undefined : (
          <View style={{ paddingHorizontal: size.inset, paddingTop: 28, gap: 12 }}>
            {tab === 'inbox' && <Tick />}
            <T style={{ fontSize: tab === 'inbox' ? 17 : 15, color: tab === 'inbox' ? color.text : color.dim }}>{EMPTY[tab]}</T>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
      <Tabs on={tab} counts={counts} pick={setTab} />
    </Wall>
  );
}
