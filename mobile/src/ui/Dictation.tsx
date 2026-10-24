// Talking into a message (lib/dictation.ts): the microphone, and while it
// listens, Stop to keep the words in the box and Send to send them.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { dictation, IDLE, type Listening as Heard } from '../lib/dictation';
import { previewSpeech } from '../lib/preview-speech';
import { phoneSpeech } from '../platform/speech';
import { Mic } from './icons';
import { T } from './parts';
import { color, font } from './theme';

const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
// Design round only (w-81bdea1efa): which of the five layouts the preview draws.
export const VARIANT: 'row' | 'wave' | 'strip' | 'panel' | 'inplace' = (globalThis as any).__dictation?.variant ?? 'row';

export type Talk = Heard & {
  on: boolean;
  seconds: number;
  /** Read now, not as of the last render. */
  active: () => boolean;
  start: () => void;
  stop: () => void;
  send: () => void;
  leave: () => void;
};

/** Dictation into `box`; `send` runs once the last words are in it. */
export function useDictation(box: { text: string; setText: (text: string) => void }, send: () => void): Talk {
  const latest = useRef(box);
  latest.current = box;
  const [now, setNow] = useState<Heard>(IDLE);
  const [ctl] = useState(() => dictation({
    speech: PREVIEW ? previewSpeech() : phoneSpeech,
    box: { read: () => latest.current.text, write: (text) => latest.current.setText(text) },
    changed: setNow,
  }));
  // The send waits a render, so it reads the box with the last words in it.
  const [sending, setSending] = useState(false);
  const sendLatest = useRef(send);
  sendLatest.current = send;
  useEffect(() => { if (sending) { setSending(false); sendLatest.current(); } }, [sending]);

  const on = now.phase !== 'idle';
  const [since, setSince] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (now.phase !== 'listening') return;
    setSince(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [now.phase]);

  useFocusEffect(useCallback(() => () => ctl.leave(), [ctl]));
  useEffect(() => {
    // Only the background: a permission question makes the app inactive too.
    const sub = AppState.addEventListener('change', (state) => { if (state === 'background') ctl.leave(); });
    return () => { sub.remove(); ctl.leave(); };
  }, [ctl]);

  return {
    ...now,
    on,
    seconds: on && since ? Math.max(0, Math.floor((tick - since) / 1000)) : 0,
    active: () => ctl.now.phase !== 'idle',
    start: () => { Keyboard.dismiss(); void ctl.start(); },
    stop: ctl.stop,
    send: () => { void ctl.finish().then(() => setSending(true)); },
    leave: ctl.leave,
  };
}

export function MicButton({ talk, lit = false }: { talk: Talk; lit?: boolean }) {
  return (
    <Pressable onPress={talk.start} accessibilityLabel="Dictate" accessibilityRole="button" hitSlop={4}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Mic tint={lit ? color.accent : color.dim} />
    </Pressable>
  );
}

const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const Dot = () => <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.accent }} />;

/** Four bars that follow the voice. */
function Level({ level, tall = 14 }: { level: number; tall?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: tall }}>
      {[0.55, 1, 0.75, 0.4].map((k, i) => (
        <View key={i} style={{ width: 2, height: Math.max(3, Math.round(tall * Math.min(1, 0.2 + level * k))), backgroundColor: color.dim }} />
      ))}
    </View>
  );
}

/** The voice over the last few seconds, newest on the right. */
function Wave({ level }: { level: number }) {
  const [seen, setSeen] = useState<number[]>(() => Array(80).fill(0));
  useEffect(() => { setSeen((s) => [...s.slice(1), level]); }, [level]);
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, height: 22, overflow: 'hidden' }}>
      {seen.map((l, i) => <View key={i} style={{ width: 2, height: Math.max(2, Math.round(22 * l)), backgroundColor: i > 74 ? color.text : color.faint }} />)}
    </View>
  );
}

function Button({ label, a11y, onPress, strong, disabled, wide }: { label: string; a11y: string; onPress: () => void; strong?: boolean; disabled?: boolean; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({
        height: wide ? 44 : 29, paddingHorizontal: strong ? 16 : 12, flex: wide ? 1 : undefined, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: wide && strong ? '#eeeae5' : color.lineStrong,
        backgroundColor: wide && strong ? (pressed ? '#d9d4ce' : '#eeeae5') : pressed ? color.picked : 'transparent', opacity: disabled ? 0.5 : 1,
      })}>
      <T style={{ fontSize: wide ? 15 : 13, fontFamily: strong ? font.semibold : font.medium, color: wide && strong ? color.bg : strong ? color.text : color.dim }}>{label}</T>
    </Pressable>
  );
}

const StopGlyph = () => <Svg width={10} height={10} viewBox="0 0 12 12"><Rect x={1} y={1} width={10} height={10} fill={color.text} /></Svg>;
const UpGlyph = () => <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={color.text} strokeWidth={1.9} strokeLinecap="square"><Path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" /></Svg>;

function Square({ a11y, onPress, children, disabled }: { a11y: string; onPress: () => void; children: React.ReactNode; filled?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent', opacity: disabled ? 0.5 : 1 })}>
      {children}
    </Pressable>
  );
}

/**
 * What takes the place of a box's foot while it listens. `lead` lines its
 * first mark up with the words above it.
 */
export function Listening({ talk, canSend = true, lead = 0 }: { talk: Talk; canSend?: boolean; lead?: number }) {
  const finishing = talk.phase === 'finishing';
  const word = talk.phase === 'listening' ? 'Listening' : finishing ? 'Finishing' : 'Starting';
  if (VARIANT === 'wave') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingLeft: lead }}>
        <Wave level={talk.level} />
        <Square a11y="Stop dictating" onPress={talk.stop} disabled={finishing}><StopGlyph /></Square>
        {canSend && <Square a11y="Send what you said" onPress={talk.send} filled disabled={finishing}><UpGlyph /></Square>}
      </View>
    );
  }
  if (VARIANT === 'inplace') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={talk.stop} accessibilityRole="button" accessibilityLabel="Stop dictating" hitSlop={4}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 24, height: 24, borderWidth: 1.5, borderColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 8, height: 8, backgroundColor: color.accent }} />
          </View>
        </Pressable>
        <T style={{ fontSize: 13, color: color.faint }}>{`${word}…`}</T>
        <Level level={talk.level} />
        <View style={{ flex: 1 }} />
        {canSend && <Button label="Send" a11y="Send what you said" onPress={talk.send} strong disabled={finishing} />}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 36 }}>
      <View style={{ marginLeft: lead }}><Dot /></View>
      <Level level={talk.level} />
      <T style={{ flex: 1, fontSize: 13, color: color.dim }}>{word}</T>
      <Button label="Stop" a11y="Stop dictating" onPress={talk.stop} disabled={finishing} />
      {canSend && <Button label="Send" a11y="Send what you said" onPress={talk.send} strong disabled={finishing} />}
    </View>
  );
}

/** Option C: a strip over the box, with Stop; the box's own Send sends. */
export function ListeningStrip({ talk }: { talk: Talk }) {
  return (
    <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 14, paddingRight: 6, borderWidth: 1, borderBottomWidth: 0, borderColor: color.lineStrong, backgroundColor: color.card }}>
      <Dot />
      <T style={{ fontSize: 13, color: color.dim }}>Listening</T>
      <T style={{ flex: 1, fontSize: 13, color: color.faint, fontFamily: font.mono }}>{clockOf(talk.seconds)}</T>
      <Pressable onPress={talk.stop} accessibilityRole="button" accessibilityLabel="Stop dictating" hitSlop={6} style={{ paddingHorizontal: 8, height: 30, justifyContent: 'center' }}>
        <T style={{ fontSize: 13, fontFamily: font.medium, color: color.text, textDecorationLine: 'underline', textDecorationColor: color.faint }}>Stop</T>
      </Pressable>
    </View>
  );
}

/** Option D: a panel where the keyboard would be, with Stop and Send across it. */
export function ListeningPanel({ talk, canSend = true, foot }: { talk: Talk; canSend?: boolean; foot: number }) {
  const finishing = talk.phase === 'finishing';
  const ring = 64 + Math.round(26 * talk.level);
  return (
    <View style={{ height: 270 + foot, paddingBottom: 16 + foot, paddingHorizontal: 16, paddingTop: 18, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.card }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: ring, height: ring, borderRadius: ring / 2, borderWidth: 1.5, borderColor: 'rgba(238, 96, 24, 0.55)' }} />
          <Mic size={26} tint={color.text} />
        </View>
        <T style={{ fontSize: 13, color: color.dim }}>{`Listening  ${clockOf(talk.seconds)}`}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button wide label="Stop" a11y="Stop dictating" onPress={talk.stop} disabled={finishing} />
        {canSend && <Button wide strong label="Send" a11y="Send what you said" onPress={talk.send} disabled={finishing} />}
      </View>
    </View>
  );
}

/** Why it stopped, and the way to Settings when the microphone was refused. */
export function DictationProblem({ talk }: { talk: Talk }) {
  if (talk.on || !talk.problem) return null;
  return (
    <T style={{ fontSize: 13, color: color.dim }}>
      {talk.problem}
      {talk.settings && <T onPress={() => void Linking.openSettings()} suppressHighlighting accessibilityRole="button" style={{ fontSize: 13, color: color.dim, textDecorationLine: 'underline' }}>{' Open Settings'}</T>}
    </T>
  );
}
