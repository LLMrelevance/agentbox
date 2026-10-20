// The pieces every screen is made of, in the desktop's look.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color, font, size } from './theme';

/** Ember Grid's wall: the dot grid and the orange glow (renderer/src/styles.css). */
export function Wall({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flex: 1, backgroundColor: color.bg }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Pattern id="d" width={32} height={32} patternUnits="userSpaceOnUse"><Circle cx={16} cy={16} r={1.15} fill="white" fillOpacity={0.055} /></Pattern>
          <RadialGradient id="g" cx="0.72" cy="0.28" r="0.7"><Stop offset="0" stopColor={color.accent} stopOpacity={0.075} /><Stop offset="1" stopColor={color.accent} stopOpacity={0} /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
        <Rect width="100%" height="100%" fill="url(#d)" />
      </Svg>
      {children}
    </View>
  );
}

export function T({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[{ fontFamily: font.regular, color: color.text, fontSize: 15.5 }, style]} />;
}

/** The phone layout's top bar: 56px, the wall's own colour, the title on the left. */
export function TopBar({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  const inset = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: inset.top, backgroundColor: color.bg }}>
      <View style={{ height: size.topBar, flexDirection: 'row', alignItems: 'center', paddingLeft: left ? 4 : size.inset, paddingRight: 4 }}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? <T numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 19, letterSpacing: -0.19 }}>{title}</T> : title}
        </View>
        {right}
      </View>
    </View>
  );
}

export function IconButton({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={4} style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

/** A plain button in the look: square, a line round it, the accent only where it was approved. */
export function Button({ title, onPress, kind = 'plain', disabled, style }: { title: string; onPress: () => void; kind?: 'plain' | 'send'; disabled?: boolean; style?: ViewStyle }) {
  const send = kind === 'send';
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [{
        height: send ? 32 : 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: send ? color.accent : pressed ? color.raised : 'transparent',
        borderWidth: send ? 0 : 1, borderColor: color.lineStrong, opacity: disabled ? 0.4 : pressed && send ? 0.8 : 1,
      }, style]}>
      <T style={{ fontFamily: font.medium, fontSize: 15, color: send ? '#fff' : color.text }}>{title}</T>
    </Pressable>
  );
}
