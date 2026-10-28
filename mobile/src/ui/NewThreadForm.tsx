// The New thread form, as the phone layout draws it (phone.css `.tc-card`): a
// row each for where it goes, the model, the project and the priority, the
// message under them, and attaching a file or picture at the foot. The New
// thread page wears it whole; the empty inbox draws it open on the page, as
// the web app does (Pages.tsx `InboxClear`).
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { modelLabelOf } from '../../../renderer/src/models';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { laterHint, momentFromWords, mondayMorning, projectSwatch, tomorrowMorning } from '../../../renderer/src/threads/composer-rules';
import type { Choices } from '../lib/actions';
import { newThreadChoices, onceAtATime, openingChoices, pickEffort, pickModel, pickProject, projectNow } from '../lib/compose';
import { useDraft } from '../lib/drafts';
import { appStore } from '../platform/persist';
import { useCloud } from '../state/cloud';
import { AttachSheet, Attached } from './Attach';
import { DictationProblem, Listening, MicButton, useDictation } from './Dictation';
import { Caret, Clip, Clock } from './icons';
import { TimeBox, TypingSheet } from './Later';
import { Pickable, PriorityBars, Sheet, SheetHead, SheetRow, T } from './parts';
import { ModelSheet, PrioritySheet, barsFor } from './Pickers';
import { color, font, size } from './theme';

const Swatch = ({ slug }: { slug: string }) => <View style={{ width: 9, height: 9, backgroundColor: projectSwatch(slug) }} />;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T style={{ width: 84, fontSize: 15, color: color.dim }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Everything the form holds, and its send; `sent` runs once a thread has gone. */
export function useNewThread(sent: () => void) {
  const c = useCloud();
  const projects = c.view.products;
  // Her words, files and priority outlive the page (lib/drafts.ts); the
  // project, model and level are the ones she last picked (lib/compose.ts).
  const draft = useDraft('new', appStore);
  const [opening] = useState(() => openingChoices(projects, appStore));
  const [picked, setPicked] = useState<string | null>(null);
  const product = projectNow(projects, picked, appStore) ?? '';
  const [model, setModel] = useState(opening.model);
  const [effort, setEffort] = useState<string | null>(opening.effort);
  const [sheet, setSheet] = useState<'model' | 'project' | 'priority' | 'attach' | 'later' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  const canSend = (!!draft.text.trim() || draft.files.length > 0) && !!product && !busy;

  const sendNow = async (later: Choices = {}) => {
    if (!canSend) return;
    setSheet(null); setBusy(true); setError(null);
    pickProject(appStore, product);
    try {
      const saved = await c.attach(product, draft.files);
      await c.send({ kind: 'new', product, text: draft.text, saved, choices: { ...newThreadChoices({ priority: draft.priority, model, effort }), ...later } }, null);
      // The draft goes only once the thread has: a failed send keeps every word on the page.
      draft.take();
      sent();
    } catch (err) { setError(`Not sent: ${String((err as Error)?.message ?? err)}`); } finally { setBusy(false); }
  };
  // Busy is drawn a frame late; two quick presses must still send once.
  const latest = useRef(sendNow);
  latest.current = sendNow;
  const [send] = useState(() => onceAtATime((later?: Choices) => latest.current(later)));
  const talk = useDictation(draft, () => void send());
  return {
    draft, product, projectName, projects, model, setModel, effort, setEffort, sheet, setSheet, busy, error, setError, canSend, send, talk,
    pickProject: (slug: string) => { setPicked(slug); pickProject(appStore, slug); },
  };
}
export type NewThread = ReturnType<typeof useNewThread>;

/** Send and its Send later caret. */
export function SendButtons({ form }: { form: NewThread }) {
  const { canSend, talk, send, busy, setSheet } = form;
  return (
    <View style={{ flexDirection: 'row', opacity: canSend ? 1 : 0.45 }}>
      <Pressable disabled={!canSend} onPress={() => (talk.on ? talk.send() : void send())} accessibilityRole="button" accessibilityLabel="Send"
        style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, opacity: pressed ? 0.85 : 1 })}>
        <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
      </Pressable>
      <Pressable disabled={!canSend} onPress={() => setSheet('later')} accessibilityRole="button" accessibilityLabel="Send later"
        style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderLeftWidth: 1, borderLeftColor: 'rgba(26, 24, 23, 0.28)', opacity: pressed ? 0.85 : 1 })}>
        <Caret />
      </Pressable>
    </View>
  );
}

/** The four rows and the message. `inline` is the empty inbox's: a shorter box that does not take the keyboard on its own. */
export function NewThreadFields({ form, inline = false, onFocus, onBlur }: { form: NewThread; inline?: boolean; onFocus?: () => void; onBlur?: () => void }) {
  const { draft, talk, product, projectName, model, setSheet, error } = form;
  return (
    <>
      <Field label="To"><T style={{ fontSize: 15 }}>Agent</T></Field>
      <Field label="Model"><Pickable style={{ fontSize: 15 }} onPress={() => setSheet('model')}>{modelLabelOf(model)}</Pickable></Field>
      <Field label="Project">
        <Pressable onPress={() => setSheet('project')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!product && <Swatch slug={product} />}
          <T style={{ fontSize: 15, marginLeft: 6 }}>{projectName || 'Pick a project'}</T>
        </Pressable>
      </Field>
      <Field label="Priority">
        <Pressable onPress={() => setSheet('priority')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PriorityBars level={barsFor(priorityValueOf(draft.priority ?? 'medium'))} />
          <T style={{ fontSize: 15 }}>{priorityLabelOf(draft.priority ?? 'medium')}</T>
        </Pressable>
      </Field>
      {/* Typing stops dictation with the words kept; tapping the box does not (web-speech.ts). */}
      <TextInput multiline autoFocus={!inline} value={draft.text} placeholder="What do you need done?" placeholderTextColor={color.faint}
        onChangeText={(t) => { if (talk.active()) talk.leave(); draft.setText(t); }} onFocus={onFocus} onBlur={onBlur}
        style={[{ flex: inline ? undefined : 1, minHeight: inline ? 120 : 160, padding: 16, fontFamily: font.regular, fontSize: 16, lineHeight: 24.8, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      <View style={{ paddingHorizontal: 16, paddingBottom: draft.files.length || error || draft.dropped ? 14 : 0, gap: 10 }}>
        <Attached files={draft.files} drop={(i) => draft.setFiles((f) => f.filter((_, n) => n !== i))} />
        {draft.dropped > 0 && (
          <T style={{ fontSize: 13, color: color.dim }}>
            {draft.dropped === 1 ? 'One file is too big to keep. Leaving this page loses it.' : `${draft.dropped} files are too big to keep. Leaving this page loses them.`}
          </T>
        )}
        {error && <T style={{ fontSize: 13, color: color.dim }}>{error}</T>}
        <DictationProblem talk={talk} />
      </View>
    </>
  );
}

/** Attach a file or picture, the microphone, and on the inbox Send itself. */
export function NewThreadFoot({ form, foot = 0, send }: { form: NewThread; foot?: number; send?: ReactNode }) {
  const { talk, setSheet } = form;
  return (
    <View style={{ height: 52 + foot, paddingBottom: foot, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color.line }}>
      {talk.on ? (
        <View style={{ flex: 1, flexDirection: 'row', paddingLeft: 16, paddingRight: 12 }}><Listening talk={talk} /></View>
      ) : (
        <>
          <Pressable onPress={() => setSheet('attach')} accessibilityRole="button" accessibilityLabel="Attach a file or picture"
            style={({ pressed }) => ({ flex: 1, height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? color.fill : 'transparent' })}>
            <Clip />
            <T style={{ fontSize: 15, color: color.dim }}>{send ? 'Attach' : 'Attach a file or picture'}</T>
          </Pressable>
          <View style={{ marginRight: send ? 4 : 8 }}><MicButton talk={talk} /></View>
          {send && <View style={{ marginRight: 12 }}>{send}</View>}
        </>
      )}
    </View>
  );
}

/** The pickers the form opens. */
export function NewThreadSheets({ form, now }: { form: NewThread; now: number }) {
  const { draft, sheet, setSheet, model, setModel, effort, setEffort, projects, product, send, setError } = form;
  const [typed, setTyped] = useState('');
  const moment = momentFromWords(typed, now);
  return (
    <>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model} effort={effort}
        pickModel={(id) => { setModel(id); pickModel(appStore, id); }} pickEffort={(id) => setEffort(pickEffort(appStore, effort, id))} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priorityValueOf(draft.priority ?? 'medium')} pick={(v) => draft.setPriority(priorityIdOf(v))} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => draft.setFiles((f) => [...f, ...more])} fail={setError} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { form.pickProject(p.slug); setSheet(null); }} />)}
      </Sheet>
      {/* Send later, as the desktop's composer offers it (composer-rules.ts). */}
      <TypingSheet open={sheet === 'later'} close={() => setSheet(null)}>
        <SheetHead>Send later</SheetHead>
        <SheetRow label="Add it to Later" lead={<Clock />} onPress={() => void send({ start: 'later' })} />
        <SheetRow label="Tomorrow morning" lead={<Clock />} aside={laterHint(tomorrowMorning(now))} onPress={() => void send({ runAt: tomorrowMorning(now) })} />
        <SheetRow label="Monday morning" lead={<Clock />} aside={laterHint(mondayMorning(now))} onPress={() => void send({ runAt: mondayMorning(now) })} />
        <TimeBox lead={<Clock />} value={typed} onChange={setTyped} placeholder="Or type: 3h, fri 6pm, tomorrow 9am"
          onSubmit={() => { if (moment) void send({ runAt: moment.ts }); }} onLine={() => { if (moment) void send({ runAt: moment.ts }); }}
          line={!typed.trim() ? null : moment ? { text: moment.hint, tone: 'ok' } : { text: 'Not a time yet', tone: 'unread' }} />
      </TypingSheet>
    </>
  );
}

/**
 * The empty inbox's form. A thread arriving while you type takes the inbox's
 * place; your words go on to the New thread page, as the web app moves them
 * into its dialog.
 */
export function InboxComposer() {
  const c = useCloud();
  const form = useNewThread(() => {});
  const typing = useRef(false);
  const text = useRef(form.draft.text);
  text.current = form.draft.text;
  useEffect(() => () => { if (typing.current && text.current.trim()) router.push('/new'); }, []);
  return (
    <View style={{ borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.card }}>
      <NewThreadFields form={form} inline onFocus={() => { typing.current = true; }} onBlur={() => { typing.current = false; }} />
      <NewThreadFoot form={form} send={<SendButtons form={form} />} />
      <NewThreadSheets form={form} now={c.now} />
    </View>
  );
}
