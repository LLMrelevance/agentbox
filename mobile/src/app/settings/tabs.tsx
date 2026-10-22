// OPTION D: three tabs, Personal, Agents and Workspace, each with its pages one after another.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloud } from '../../state/cloud';
import { useSettings } from '../../state/settings';
import { Back } from '../../ui/icons';
import { T, Wall } from '../../ui/parts';
import { computerLine } from '../../ui/SettingsHome';
import { GROUPS, SETTINGS_PAGES } from '../../ui/SettingsPages';
import { color, font, size } from '../../ui/theme';

export default function SettingsTabs() {
  const c = useCloud();
  const s = useSettings();
  const inset = useSafeAreaInsets();
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Personal');
  const line = computerLine(s, c.now);
  return (
    <Wall>
      <View style={{ paddingTop: inset.top }}>
        <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: size.inset }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 }}>
            <Back size={14} />
            <T style={{ fontSize: 13, letterSpacing: 0.52, color: color.dim }}>Back to app</T>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: size.inset, paddingTop: 4 }}>
          <T style={{ fontSize: 24, lineHeight: 31, letterSpacing: -0.84 }}>Settings</T>
          {line ? <T style={{ fontSize: 13.5, lineHeight: 20, color: color.faint, marginTop: 6 }}>{line}</T> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 24, paddingHorizontal: size.inset, marginTop: 14, borderBottomWidth: 1, borderBottomColor: color.line }}>
          {GROUPS.map((g) => (
            <Pressable key={g} onPress={() => setGroup(g)} accessibilityRole="tab" accessibilityState={{ selected: g === group }}
              style={{ height: 42, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: g === group ? color.accent : 'transparent', marginBottom: -1 }}>
              <T style={{ fontSize: 16, color: g === group ? color.text : color.faint, fontFamily: g === group ? font.medium : font.regular }}>{g}</T>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: size.inset, paddingBottom: 40 + inset.bottom }}>
        {SETTINGS_PAGES.filter((p) => p.group === group && p.shown(s)).map((p) => (
          <View key={p.id}>
            <T style={{ fontSize: 19, lineHeight: 24, fontFamily: font.medium, letterSpacing: -0.3, marginTop: 36 }}>{p.label}</T>
            {p.lede ? <T style={{ fontSize: 13, lineHeight: 19, color: color.faint, marginTop: 6 }}>{p.lede}</T> : null}
            <p.Body />
          </View>
        ))}
      </ScrollView>
    </Wall>
  );
}
