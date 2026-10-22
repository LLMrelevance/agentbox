// OPTION B: the pages as a strip across the top, as the phone website draws the desktop's Settings.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { Back } from '../../ui/icons';
import { T, Wall } from '../../ui/parts';
import { computerLine } from '../../ui/SettingsHome';
import { SETTINGS_PAGES, type PageId } from '../../ui/SettingsPages';
import { color, font, size } from '../../ui/theme';

export default function SettingsStrip() {
  const c = useCloud();
  const s = useSettings();
  const inset = useSafeAreaInsets();
  const pages = SETTINGS_PAGES.filter((p) => p.shown(s));
  const [at, setAt] = useState<PageId>('general');
  const def = pages.find((p) => p.id === at) ?? pages[0];
  const lede = def.lede ?? (def.id === 'general' ? computerLine(s, c.now) : undefined);
  return (
    <Wall>
      <View style={{ paddingTop: inset.top, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: size.inset }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }}>
            <Back size={14} />
            <T style={{ fontSize: 13, letterSpacing: 0.52, color: color.dim }}>Back to app</T>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: size.inset, gap: 22 }}>
          {pages.map((p) => (
            <Pressable key={p.id} onPress={() => setAt(p.id)} accessibilityRole="tab" accessibilityState={{ selected: p.id === def.id }}
              style={{ height: 40, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: p.id === def.id ? color.accent : 'transparent' }}>
              <T style={{ fontSize: 14.5, color: p.id === def.id ? color.text : color.faint, fontFamily: p.id === def.id ? font.medium : font.regular }}>{p.label}</T>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 24, paddingHorizontal: size.inset, paddingBottom: 40 + inset.bottom }}>
        <T style={{ fontSize: 24, lineHeight: 31, letterSpacing: -0.84 }}>{def.label}</T>
        {lede ? <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint, marginTop: 8 }}>{lede}</T> : null}
        <def.Body />
      </ScrollView>
    </Wall>
  );
}
