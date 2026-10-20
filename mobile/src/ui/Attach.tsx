// Attaching on the phone: the row or the paperclip that opens it, the sheet
// that asks where from, and the files waiting to go, each with a way to drop it.
import { Pressable, View } from 'react-native';
import { pickFiles, pickPhotos, type Picked } from '../platform/pick';
import { Clip, Cross } from './icons';
import { Sheet, SheetHead, SheetRow, T } from './parts';
import { color } from './theme';

export function AttachSheet({ open, close, add, fail }: { open: boolean; close: () => void; add: (files: Picked[]) => void; fail: (why: string) => void }) {
  const from = (pick: () => Promise<Picked[]>) => async () => {
    close();
    try { add(await pick()); } catch (err) { fail(String((err as Error)?.message ?? err)); }
  };
  return (
    <Sheet open={open} close={close}>
      <SheetHead>Attach</SheetHead>
      <SheetRow label="Photo library" onPress={from(pickPhotos)} />
      <SheetRow label="Files" onPress={from(pickFiles)} />
    </Sheet>
  );
}

/** The files waiting to go with the message. */
export function Attached({ files, drop }: { files: Picked[]; drop: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {files.map((f, i) => (
        <View key={`${f.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 10, paddingRight: 4, borderWidth: 1, borderColor: color.line, backgroundColor: color.fill, maxWidth: 240 }}>
          <Clip size={13} tint={color.faint} />
          <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: color.dim }}>{f.name}</T>
          <Pressable onPress={() => drop(i)} accessibilityLabel={`Remove ${f.name}`} hitSlop={6} style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Cross size={12} tint={color.faint} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
