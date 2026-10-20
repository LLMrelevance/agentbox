// A new thread, a whole page as the phone layout draws it (phone.css `.tc-card`):
// a cross and the page's name, Send at the right, a row each for where it
// goes, the model, the project and the priority, and the message under them.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { DEFAULT_MODEL, modelLabelOf } from '../../../renderer/src/models';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import { projectSwatch } from '../../../renderer/src/threads/composer-rules';
import { useCloud } from '../state/cloud';
import { Cross } from '../ui/icons';
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
  const projects = c.view.products;
  const [product, setProduct] = useState(projects[0]?.slug ?? '');
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<string | null>(null);
  const [priority, setPriority] = useState(MEDIUM);
  const [body, setBody] = useState('');
  const [sheet, setSheet] = useState<'model' | 'project' | 'priority' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectName = useMemo(() => projects.find((p) => p.slug === product)?.name ?? '', [projects, product]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const canSend = !!body.trim() && !!product && !busy;

  const send = async () => {
    setBusy(true); setError(null);
    try {
      await c.send({ kind: 'new', product, body, choices: { priority, ...(model ? { model } : {}), ...(effort ? { effort } : {}) } }, null);
      close();
    } catch (err) { setError(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };

  return (
    <Wall>
      <TopBar
        left={<IconButton label="Close" onPress={close}><Cross /></IconButton>}
        title={<T style={{ fontFamily: font.medium, fontSize: 19, letterSpacing: -0.19, paddingLeft: 4 }}>New thread</T>}
        right={(
          <Pressable disabled={!canSend} onPress={send} accessibilityRole="button" accessibilityLabel="Send"
            style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, marginRight: 12, justifyContent: 'center', backgroundColor: color.accent, opacity: !canSend ? 0.45 : pressed ? 0.85 : 1 })}>
            <T style={{ fontSize: 15, fontFamily: font.medium, color: '#fff' }}>{busy ? 'Sending…' : 'Send'}</T>
          </Pressable>
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
            style={[{ flex: 1, minHeight: 200, padding: 16, fontFamily: font.regular, fontSize: 16, lineHeight: 24.8, color: color.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          {error && <T style={{ fontSize: 13, color: color.dim, paddingHorizontal: 16, paddingBottom: 16 }}>{error}</T>}
        </ScrollView>
      </KeyboardAvoidingView>
      <ModelSheet open={sheet === 'model'} close={() => setSheet(null)} model={model ?? DEFAULT_MODEL} effort={effort} pickModel={setModel} pickEffort={setEffort} />
      <PrioritySheet open={sheet === 'priority'} close={() => setSheet(null)} value={priority} pick={setPriority} />
      <Sheet open={sheet === 'project'} close={() => setSheet(null)}>
        <SheetHead>Project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} on={p.slug === product} lead={<Swatch slug={p.slug} />} onPress={() => { setProduct(p.slug); setSheet(null); }} />)}
      </Sheet>
    </Wall>
  );
}
