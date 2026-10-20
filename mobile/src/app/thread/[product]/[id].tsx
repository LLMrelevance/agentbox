// One thread, as the phone layout draws it: the conversation, the agent's
// last word, the options it still offers, and the reply box that opens into
// the desktop's sentence. A press leaves a command for the Mac and shows at
// once as waiting for it.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clock, dayHeading } from '../../../../../renderer/src/thread-history';
import { dayAndTime, type ParsedOption } from '../../../../../renderer/src/format';
import { laterPresets } from '../../../../../renderer/src/later-times';
import { MODE_WORDS } from '../../../../../renderer/src/modes';
import { DEFAULT_MODEL, modelLabelOf } from '../../../../../renderer/src/models';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../../../renderer/src/priority';
import { stateWordOf } from '../../../../../renderer/src/threads/summary-rules';
import { summaryOf, threadState } from '../../../../../shared/thread-cards.mjs';
import type { Choices, Press } from '../../../lib/actions';
import { threadOf, type Thread } from '../../../lib/thread';
import { useCloud } from '../../../state/cloud';
import { Back, Cloud, More, Panel } from '../../../ui/icons';
import { Markdown } from '../../../ui/Markdown';
import { IconButton, Pickable, PriorityBars, RunningMark, Sheet, SheetHead, SheetRow, SheetSep, T, TopBar, Wall } from '../../../ui/parts';
import { ModelSheet, ModeSheet, PrioritySheet, barsFor } from '../../../ui/Pickers';
import { color, font, size } from '../../../ui/theme';

const when = (at: number) => (at ? `${dayHeading(at)} ${clock(at)}` : '');

/** A thread's state as the desktop marks it (`.th-st.s-*`, threads/pages.css). */
function StateDot({ state }: { state: string }) {
  if (state === 'running') return <RunningMark />;
  const dot = { width: 12, height: 12, borderRadius: 6 };
  if (state === 'scheduled') return <View style={{ ...dot, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.faint }} />;
  return <View style={{ ...dot, backgroundColor: state === 'waiting' ? color.accent : color.faint }} />;
}

function Said({ e, turnEnd }: { e: any; turnEnd: boolean }) {
  const yours = e.who === 'you';
  return (
    <View style={yours && turnEnd ? { borderBottomWidth: 1, borderBottomColor: color.lineStrong, paddingBottom: 22, marginBottom: 16 } : null}>
      {!e.same && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
          <T style={yours ? { fontSize: 14, lineHeight: 22.4, fontFamily: font.semibold } : { fontSize: 14, lineHeight: 22.4, color: color.dim }}>{yours ? 'You' : 'The agent'}</T>
          <T style={{ fontSize: 12.5, lineHeight: 20, color: color.faint, flexShrink: 1 }} numberOfLines={2}>
            {e.refused ? `Not sent: ${e.refused}` : e.pending ? 'Waiting for your computer' : when(e.at)}
          </T>
        </View>
      )}
      {yours ? <T style={{ fontSize: 17, lineHeight: 26.35, fontFamily: font.medium }}>{e.text}</T> : <Markdown text={e.text} />}
    </View>
  );
}

function Options({ ask, options, busy, pick }: { ask: string; options: ParsedOption[]; busy: boolean; pick: (o: ParsedOption) => void }) {
  return (
    <View style={{ marginTop: 22, borderWidth: 1, borderColor: color.line }}>
      <View style={{ paddingTop: 11, paddingHorizontal: 16, paddingBottom: 7 }}>
        <T style={{ fontSize: 12.5, lineHeight: 17.5, fontFamily: font.semibold }}>{ask || 'Their options · pick or write your own'}</T>
      </View>
      {options.map((o) => (
        <Pressable key={o.n} disabled={busy} onPress={() => pick(o)} accessibilityRole="button"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 7, paddingHorizontal: 16, paddingBottom: 11, backgroundColor: pressed ? color.fill : 'transparent', opacity: busy ? 0.5 : 1 })}>
          <View style={{ borderWidth: 1, borderColor: color.lineStrong, paddingHorizontal: 6, height: 19, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 1 }}>
            <T style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: color.dim }}>{o.n}</T>
          </View>
          <T style={{ flexShrink: 1, fontSize: 14, lineHeight: 20.3, color: color.dim }}>{o.text.replace(/\s*\(recommended\)\s*$/i, '')}</T>
          {o.recommended && <T style={{ fontSize: 11.5, lineHeight: 16.7, color: color.faint, paddingLeft: 8 }}>recommended</T>}
        </Pressable>
      ))}
    </View>
  );
}

function Dock({ thread, busy, send }: { thread: Thread; busy: boolean; send: (text: string, choices: Choices) => Promise<boolean> }) {
  const inset = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Choices>({});
  const [sheet, setSheet] = useState<'priority' | 'mode' | 'model' | null>(null);
  const priority = picked.priority ?? thread.item.priority ?? priorityValueOf('medium');
  const model = picked.model ?? thread.item.model ?? DEFAULT_MODEL;
  const mode = picked.permissionMode ?? 'auto';
  const foot = Math.max(8, inset.bottom - 14);
  const card = { borderWidth: 1, backgroundColor: color.fill };
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 16 + foot, paddingTop: 8 }}>
      {!open ? (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Reply"
          style={{ ...card, borderColor: color.line, height: 43, flexDirection: 'row', alignItems: 'center' }}>
          <T style={{ flex: 1, fontSize: 14.5, color: color.faint, paddingHorizontal: 16 }}>Reply…</T>
          <T style={{ fontSize: 13, color: color.dim, marginRight: 12, textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: color.faint }}>{modelLabelOf(model)}</T>
        </Pressable>
      ) : (
        <View style={{ ...card, borderColor: color.lineStrong }}>
          <TextInput autoFocus multiline value={text} onChangeText={setText} placeholder="What should the agent do next?" placeholderTextColor={color.faint}
            onBlur={() => { if (!text.trim()) setOpen(false); }}
            style={[{ minHeight: 92, maxHeight: 220, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6, fontFamily: font.regular, fontSize: 15.5, lineHeight: 24, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 9, paddingBottom: 10, paddingLeft: 18, paddingRight: 14 }}>
            <T style={{ flex: 1, fontSize: 13, lineHeight: 21, color: color.faint }}>
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('priority')}>{priorityLabelOf(priorityIdOf(priority))}</Pickable>
              {' priority. In '}
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('mode')}>{MODE_WORDS[mode as keyof typeof MODE_WORDS] ?? mode}</Pickable>
              {' Mode. On '}
              <Pickable style={{ fontSize: 13, color: color.dim }} onPress={() => setSheet('model')}>{modelLabelOf(model)}</Pickable>
              {'.'}
            </T>
            <Pressable disabled={busy || !text.trim()} accessibilityRole="button"
              onPress={async () => { if (await send(text, picked)) { setText(''); setPicked({}); setOpen(false); } }}
              style={({ pressed }) => ({ height: 29, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: color.lineStrong, backgroundColor: pressed ? color.picked : 'transparent', opacity: busy || !text.trim() ? 0.5 : 1 })}>
              <T style={{ fontSize: 13, fontFamily: font.semibold }}>Send</T>
            </Pressable>
          </View>
        </View>
      )}
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priority} pick={(v) => setPicked((p) => ({ ...p, priority: v }))} />
      <ModeSheet open={sheet === 'mode'} close={() => setSheet(null)} value={mode} pick={(v) => setPicked((p) => ({ ...p, permissionMode: v }))} />
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={picked.effort ?? thread.item.effort ?? null}
        pickModel={(v) => setPicked((p) => ({ ...p, model: v }))} pickEffort={(v) => setPicked((p) => ({ ...p, effort: v }))} />
    </View>
  );
}

function Summary({ thread, close }: { thread: Thread; close: () => void }) {
  const item = thread.item;
  // Context and Done, the summary's two lines, with the desktop's fallbacks.
  const told = summaryOf(item);
  const heading = { fontFamily: font.mono, fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase' as const, color: color.faint };
  const row = (label: string, value: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 }}>
      <T style={{ width: 92, fontSize: 15, color: color.faint }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{value}</View>
    </View>
  );
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <Wall>
        <TopBar left={<IconButton label="Back" onPress={close}><Back /></IconButton>} title={<T numberOfLines={1} style={{ fontSize: 15, paddingHorizontal: 6 }}>{thread.title}</T>} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', padding: size.inset, paddingBottom: size.inset + 24 }}>
          <View style={{ gap: 22 }}>
            <T style={{ fontSize: 17, lineHeight: 24, fontFamily: font.medium }}>{thread.title}</T>
            {!!told.problem.trim() && (
              <View style={{ gap: 10 }}>
                <T style={heading}>Context</T>
                <T style={{ fontSize: 15, lineHeight: 23, color: color.dim }}>{told.problem}</T>
              </View>
            )}
            {!!told.progress.trim() && (
              <View style={{ gap: 10 }}>
                <T style={heading}>Done</T>
                {told.progress.split('\n').filter((l) => l.trim()).map((l, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color.faint, marginTop: 9 }} />
                    <T style={{ flex: 1, fontSize: 15, lineHeight: 23, color: color.dim }}>{l.trim()}</T>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingTop: 14, marginTop: 28, gap: 4 }}>
            {row('Status', <><StateDot state={threadState(item)} /><T style={{ fontSize: 15 }}>{stateWordOf(item, threadState(item))}</T></>)}
            {row('Priority', <><PriorityBars level={barsFor(item.priority)} /><T style={{ fontSize: 15 }}>{priorityLabelOf(priorityIdOf(item.priority))}</T></>)}
            {row('Owner', <T style={{ fontSize: 15 }}>You</T>)}
            {row('Project', <T style={{ fontSize: 15 }}>{thread.projectName}</T>)}
          </View>
        </ScrollView>
      </Wall>
    </Modal>
  );
}

export default function ThreadScreen() {
  const { product, id } = useLocalSearchParams<{ product: string; id: string }>();
  const c = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [summary, setSummary] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const thread = useMemo(() => threadOf(c.rows, c.view, String(product), String(id)), [c.rows, c.view, product, id]);
  const live = c.view.running.find((r: any) => r.itemId === id && r.product === product);

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
    try { await c.send(p, thread.item); then?.(); return true; } catch (err) { setError(String((err as Error)?.message ?? err)); return false; } finally { setBusy(false); }
  };
  const said = thread.events;
  const nextWho = (i: number) => (said.slice(i + 1).find((e: any) => e.kind !== 'work') as any)?.who;

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Back" width={34} onPress={back}><Back /></IconButton>}
        title={<T numberOfLines={1} style={{ fontSize: 15, paddingLeft: 13, paddingRight: 6 }}>{thread.title}</T>}
        right={<>
          <IconButton label="Show the summary" width={44} onPress={() => setSummary(true)}><Panel /></IconButton>
          <IconButton label="More" width={30} onPress={() => setMenu(true)}><More /></IconButton>
          <View style={{ width: 16 }} />
        </>}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The latest stays in view as the thread grows and as the reply box opens over it. */}
        <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: size.inset, paddingTop: 16, paddingBottom: 24 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          onLayout={() => scroll.current?.scrollToEnd({ animated: false })}>
          <View style={{ gap: 22 }}>
            {said.map((e: any, i: number) => (e.kind === 'work'
              ? <T key={i} numberOfLines={1} style={{ fontSize: 13, color: color.faint }}>{[e.verb, e.subject].filter(Boolean).join(' ')}</T>
              : <Said key={i} e={e} turnEnd={e.who === 'you' && nextWho(i) !== 'you'} />))}
          </View>
          {/* The thread's own 22px gap and the outcome's 28 (`.thread`, `.outcome`). */}
          {thread.outcome && <View style={{ marginTop: 50 }}><Markdown text={thread.outcome.text} /></View>}
          {thread.running && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <RunningMark cloud={live?.where === 'cloud'}><Cloud /></RunningMark>
              <T style={{ fontSize: 14, color: color.dim }}>{live?.activity?.[0]?.label || 'Working'}</T>
            </View>
          )}
          {thread.options.length > 0 && <Options ask={thread.ask} options={thread.options} busy={busy} pick={(o) => press({ kind: 'pick', option: o })} />}
          {error && <T style={{ fontSize: 13, color: color.dim, marginTop: 16 }}>{error}</T>}
        </ScrollView>
        <Dock thread={thread} busy={busy} send={(text, choices) => press({ kind: 'reply', text, choices })} />
      </KeyboardAvoidingView>
      <Sheet open={menu} close={() => setMenu(false)}>
        <SheetHead>Later</SheetHead>
        {laterPresets(c.now).map((p) => (
          <SheetRow key={p.label} label={p.label} aside={dayAndTime(p.ts).toUpperCase()} onPress={() => { setMenu(false); void press({ kind: 'later', until: p.ts }, back); }} />
        ))}
        <SheetSep />
        <SheetRow label="Close this thread" onPress={() => { setMenu(false); void press({ kind: 'close' }, back); }} />
      </Sheet>
      {summary && <Summary thread={thread} close={() => setSummary(false)} />}
    </Wall>
  );
}
