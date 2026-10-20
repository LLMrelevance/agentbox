// A new thread, a whole page as the phone layout draws it (phone.css `.tc-card`):
// a cross and the page's name, Send and its Send later caret at the right, a
// row each for where it goes, the model, the project and the priority, the
// message under them, and attaching a file or picture at the foot.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_MODEL, modelLabelOf } from '../../../renderer/src/models';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { laterHint, momentFromWords, mondayMorning, projectSwatch, tomorrowMorning } from '../../../renderer/src/threads/composer-rules';
import type { Choices } from '../lib/actions';
import { withAttachments } from '../lib/attach';
import type { Picked } from '../platform/pick';
import { useCloud } from '../state/cloud';
import { AttachSheet, Attached } from '../ui/Attach';
import { Caret, Clip, Clock, Cross } from '../ui/icons';
import { IconButton, Pickable, PriorityBars, Sheet, SheetHead, SheetRow, T, TopBar, Wall } from '../ui/parts';
import { ModelSheet, PrioritySheet, barsFor } from '../ui/Pickers';
import { color, font, size } from '../ui/theme';

const MEDIUM = priorityValueOf('medium');
const Swatch = ({ slug }: { slug: string }) => <View style={{ width: 9, height: 9, backgroundColor: projectSwatch(slug) }} />;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: size.inset, borderBottomWidth: 1, borderBottomColor: color.line }}>
      <T style={{ width: 84, fontSize: 15, color: color.dim }}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

export default function NewThread() {
  const c = useCloud();
  const inset = useSafeAreaInsets();
  const projects = c.view.products;
  const [product, setProduct] = useState(projects[0]?.slug ?? '');
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<string | null>(null);
  const [priority, setPriority] = useState(MEDIUM);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [typed, setTyped] = useState('');
  const [sheet, setSheet] = useState<'model' | 'project' | 'priority' | 'attach' | 'later' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const canSend = (!!body.trim() || files.length > 0) && !!product && !busy;
  const moment = momentFromWords(typed, c.now);
  const foot = Math.max(8, inset.bottom - 14);

  const send = async (later: Choices = {}) => {
    setSheet(null); setBusy(true); setError(null);
    try {
      const saved = await c.attach(product, files);
      const choices: Choices = { priority, ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...later };
      await c.send({ kind: 'new', product, body: withAttachments(body, saved), choices }, null);
      close();
    } catch (err) { setError(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Close" onPress={close}><Cross /></IconButton>}
        title={<T style={{ fontFamily: font.medium, fontSize: 19, letterSpacing: -0.19, paddingLeft: 4 }}>New thread</T>}
        right={(
          <View style={{ flexDirection: 'row', marginRight: 12, opacity: canSend ? 1 : 0.45 }}>
            <Pressable disabled={!canSend} onPress={() => void send()} accessibilityRole="button" accessibilityLabel="Send"
              style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: color.accent, opacity: pressed ? 0.85 : 1 })}>
              <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
            </Pressable>
            <Pressable disabled={!canSend} onPress={() => setSheet('later')} accessibilityRole="button" accessibilityLabel="Send later"
              style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderLeftWidth: 1, borderLeftColor: 'rgba(26, 24, 23, 0.28)', opacity: pressed ? 0.85 : 1 })}>
              <Caret />
            </Pressable>
          </View>
        )}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Field label="To"><T style={{ fontSize: 15 }}>Agent</T></Field>
          <Field label="Model"><Pickable style={{ fontSize: 15 }} onPress={() => setSheet('model')}>{modelLabelOf(model ?? DEFAULT_MODEL)}</Pickable></Field>
          <Field label="Project">
            <Pressable onPress={() => setSheet('project')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!!product && <Swatch slug={product} />}
              <T style={{ fontSize: 15, marginLeft: 6 }}>{projectName || 'Pick a project'}</T>
            </Pressable>
          </Field>
          <Field label="Priority">
            <Pressable onPress={() => setSheet('priority')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PriorityBars level={barsFor(priority)} />
              <T style={{ fontSize: 15 }}>{priorityLabelOf(priorityIdOf(priority))}</T>
            </Pressable>
          </Field>
          <TextInput multiline autoFocus value={body} onChangeText={setBody} placeholder="What do you need done?" placeholderTextColor={color.faint}
            style={[{ flex: 1, minHeight: 160, padding: 16, fontFamily: font.regular, fontSize: 16, lineHeight: 24.8, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          <View style={{ paddingHorizontal: 16, paddingBottom: files.length || error ? 14 : 0, gap: 10 }}>
            <Attached files={files} drop={(i) => setFiles((f) => f.filter((_, n) => n !== i))} />
            {error && <T style={{ fontSize: 13, color: color.dim }}>{error}</T>}
          </View>
        </ScrollView>
        <Pressable onPress={() => setSheet('attach')} accessibilityRole="button"
          style={({ pressed }) => ({ height: 52 + foot, paddingBottom: foot, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: color.line, backgroundColor: pressed ? color.fill : 'transparent' })}>
          <Clip />
          <T style={{ fontSize: 15, color: color.dim }}>Attach a file or picture</T>
        </Pressable>
      </KeyboardAvoidingView>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model ?? DEFAULT_MODEL} effort={effort} pickModel={setModel} pickEffort={setEffort} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priority} pick={setPriority} />
      <AttachSheet open={sheet === 'attach'} close={() => setSheet(null)} add={(more) => setFiles((f) => [...f, ...more])} fail={setError} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { setProduct(p.slug); setSheet(null); }} />)}
      </Sheet>
      {/* Send later, as the desktop's composer offers it (composer-rules.ts). */}
      <Sheet open={sheet === 'later'} close={() => setSheet(null)}>
        <SheetHead>Send later</SheetHead>
        <SheetRow label="Add it to Later" lead={<Clock />} onPress={() => void send({ start: 'later' })} />
        <SheetRow label="Tomorrow morning" lead={<Clock />} aside={laterHint(tomorrowMorning(c.now))} onPress={() => void send({ runAt: tomorrowMorning(c.now) })} />
        <SheetRow label="Monday morning" lead={<Clock />} aside={laterHint(mondayMorning(c.now))} onPress={() => void send({ runAt: mondayMorning(c.now) })} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 48 }}>
          <Clock />
          <TextInput value={typed} onChangeText={setTyped} placeholder="Or type: 3h, fri 6pm, tomorrow 9am" placeholderTextColor={color.faint}
            returnKeyType="send" onSubmitEditing={() => { if (moment) void send({ runAt: moment.ts }); }}
            style={[{ flex: 1, height: 36, paddingHorizontal: 10, borderWidth: 1, borderColor: color.line, fontFamily: font.regular, fontSize: 15, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          {!!typed.trim() && <T style={{ fontSize: 12, color: color.faint }}>{moment ? moment.hint : 'Not a time'}</T>}
        </View>
      </Sheet>
    </Wall>
  );
}
