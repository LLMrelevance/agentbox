// ONE THREAD ON THE PHONE APP: the desktop's conversation (item-thread.ts)
// from the copy a Mac sent, and the options it still offers.

import { itemThread } from '../../../renderer/src/item-thread';
import { itemOptions, offerIsLive, optionsFrom, stripOptionsSection, type ParsedOption } from '../../../renderer/src/format';
import { rowTitle } from '../../../renderer/src/list-rules';
import { phoneHistory, type PhoneRows, type phoneView } from '../../../renderer/src/phone-rows';

type View = ReturnType<typeof phoneView>;

export function threadOf(rows: PhoneRows, view: View, product: string, id: string) {
  const item = view.items.find((i: any) => i.product === product && i.id === id) ?? null;
  if (!item) return null;
  const { lines } = phoneHistory(rows, product, id, view.aliases);
  const pending = view.waiting
    .filter((w) => w.product === product && w.id === id)
    .map((w) => ({ at: w.at, text: w.text, ...(w.refused ? { refused: w.refused } : {}) }));
  const built = itemThread(lines, [], null, { pending });
  // The offer's own list comes out of the text while it is drawn as buttons
  // (Focus.tsx `cleanMessage`); "## Gist" is a heading old workers wrote.
  const live = offerIsLive(item);
  const offered = live ? String(item[optionsFrom(item)] ?? '').trim() : null;
  const clean = (text: string) => (live && text.trim() === offered ? stripOptionsSection(text) : text).replace(/^##\s*Gist\s*\n+/i, '');
  return {
    item,
    title: rowTitle(item),
    projectName: view.products.find((p) => p.slug === product)?.name ?? '',
    running: view.running.some((r: { itemId: string; product: string }) => r.itemId === id && r.product === product),
    events: built.events.map((e) => (e.kind === 'work' ? e : { ...e, text: clean(e.text ?? '') })),
    outcome: built.outcome ? { ...built.outcome, text: clean(built.outcome.text) } : null,
    options: (live ? itemOptions(item) : []) as ParsedOption[],
  };
}

export type Thread = NonNullable<ReturnType<typeof threadOf>>;
