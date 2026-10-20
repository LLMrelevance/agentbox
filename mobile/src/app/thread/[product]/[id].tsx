// One thread: the conversation as the desktop draws it, the options the agent
// still offers, and a reply box. A press leaves a command for the Mac and
// shows at once as waiting for it.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updatedWords } from '../../../../../renderer/src/threads/page-rules';
import type { ParsedOption } from '../../../../../renderer/src/format';
import type { Press } from '../../../lib/actions';
import { threadOf } from '../../../lib/thread';
import { useCloud } from '../../../state/cloud';
import { Back, More } from '../../../ui/icons';
import { Markdown } from '../../../ui/Markdown';
import { Button, IconButton, T, TopBar, Wall } from '../../../ui/parts';
import { color, font, size } from '../../../ui/theme';

const HOUR = 3_600_000;
const tomorrowAt9 = (now: number) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };

function Said({ who, at, text, now, pending, refused }: { who: 'you' | 'it'; at: number; text: string; now: number; pending?: boolean; refused?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T style={{ fontSize: 12, color: color.faint }}>{who === 'you' ? 'You' : 'The agent'}  ·  {updatedWords(at, now)}</T>
      {who === 'you'
        ? <T style={{ fontSize: 17, lineHeight: 24, fontFamily: font.medium }}>{text}</T>
        : <Markdown text={text} />}
      {refused ? <T style={{ fontSize: 13, color: color.dim }}>Your Mac turned this down. {refused}</T>
        : pending ? <T style={{ fontSize: 13, color: color.faint }}>Waiting for your Mac</T> : null}
    </View>
  );
}

function Options({ options, busy, pick }: { options: ParsedOption[]; busy: boolean; pick: (o: ParsedOption) => void }) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: color.line }}>
      {options.map((o) => {
        const words = o.text.replace(/\s*\(recommended\)\s*$/i, '');
        return (
          <Pressable key={o.n} disabled={busy} onPress={() => pick(o)} accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: size.inset, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.line, backgroundColor: pressed ? color.raised : 'transparent', opacity: busy ? 0.5 : 1 })}>
            <View style={{ width: 6, height: 6, backgroundColor: o.recommended ? color.accent : 'transparent' }} />
            <T style={{ fontFamily: font.mono, fontSize: 13, color: color.faint, width: 14 }}>{o.n}</T>
            <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{words}{o.recommended && <T style={{ fontSize: 15, color: color.faint }}>  recommended</T>}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sheet({ open, close, rows }: { open: boolean; close: () => void; rows: { label: string; run: () => void }[] }) {
  const inset = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)' }} onPress={close} />
      <View style={{ backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.lineStrong, paddingTop: 10, paddingBottom: 16 + inset.bottom, paddingHorizontal: 8 }}>
        {rows.map((r) => (
          <Pressable key={r.label} onPress={() => { close(); r.run(); }} style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: pressed ? color.raised : 'transparent' })}>
            <T style={{ fontSize: 16 }}>{r.label}</T>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

export default function ThreadScreen() {
  const { product, id } = useLocalSearchParams<{ product: string; id: string }>();
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const thread = useMemo(() => threadOf(c.rows, c.view, String(product), String(id)), [c.rows, c.view, product, id]);
  const doing = c.view.running.find((r: any) => r.itemId === id && r.product === product)?.activity?.[0]?.label;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!thread) {
    return (
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={back}><Back /></IconButton>} />
        <T style={{ padding: size.inset, color: color.dim }}>{c.loading ? '' : 'This thread is not on your phone.'}</T>
      </Wall>
    );
  }
  const press = async (p: Press, then?: () => void) => {
    setBusy(true); setError(null);
    try { await c.send(p, thread.item); then?.(); } catch (err) { setError(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };
  const said = thread.events;
  const outcomeLabel = thread.outcome?.field === 'note' ? 'Latest checkpoint' : null;

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Back" onPress={back}><Back /></IconButton>}
        right={<IconButton label="More" onPress={() => setMenu(true)}><More /></IconButton>}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: size.inset, paddingTop: 8, paddingBottom: 28, gap: 22 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <View style={{ gap: 6 }}>
            <T style={{ fontSize: 21, lineHeight: 27, fontFamily: font.medium, letterSpacing: -0.2 }}>{thread.title}</T>
            <T style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase', color: color.dim }}>{thread.projectName}</T>
          </View>
          {said.map((e: any, i: number) => (e.kind === 'work'
            ? <T key={i} numberOfLines={1} style={{ fontSize: 13, color: color.faint }}>{[e.verb, e.subject].filter(Boolean).join(' ')}</T>
            : <Said key={i} who={e.who} at={e.at} text={e.text} now={c.now} pending={e.pending} refused={e.refused} />))}
          {thread.outcome && (
            <View style={{ gap: 6 }}>
              <T style={{ fontSize: 12, color: color.faint }}>{outcomeLabel ?? 'The agent'}  ·  {updatedWords(thread.outcome.at, c.now)}</T>
              <Markdown text={thread.outcome.text} />
            </View>
          )}
          {thread.running && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 6, height: 6, backgroundColor: color.accent }} />
              <T style={{ fontSize: 13, color: color.dim }}>{doing || 'Working'}</T>
            </View>
          )}
          {error && <T style={{ fontSize: 13, color: color.dim }}>{error}</T>}
        </ScrollView>
        {thread.options.length > 0 && <Options options={thread.options} busy={busy} pick={(o) => press({ kind: 'pick', option: o })} />}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: size.inset, paddingTop: 10, paddingBottom: 10 + Math.max(0, inset.bottom - 14), borderTopWidth: thread.options.length ? 0 : 1, borderTopColor: color.line, backgroundColor: color.bg }}>
          <TextInput value={text} onChangeText={setText} placeholder="Reply" placeholderTextColor={color.faint} multiline
            style={[{ flex: 1, minHeight: 32, maxHeight: 132, paddingVertical: 6, fontFamily: font.regular, fontSize: 16, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          {text.trim().length > 0 && <Button kind="send" title="Send" disabled={busy} onPress={() => press({ kind: 'reply', text }, () => setText(''))} />}
        </View>
      </KeyboardAvoidingView>
      <Sheet open={menu} close={() => setMenu(false)} rows={[
        { label: 'Later, in 3 hours', run: () => press({ kind: 'later', until: c.now + 3 * HOUR }, back) },
        { label: 'Later, tomorrow at 9am', run: () => press({ kind: 'later', until: tomorrowAt9(c.now) }, back) },
        { label: 'Close this thread', run: () => press({ kind: 'close' }, back) },
      ]} />
    </Wall>
  );
}
