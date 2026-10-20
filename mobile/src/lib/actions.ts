// WHAT A PRESS ON THE PHONE APP LEAVES FOR THE MAC: the phone site's own
// commands (phone-rows.ts `commandFor`), from the presses the app has.

import { REQUEST_CHANNELS } from '../../../shared/bridge-map.mjs';
import { closesTheTask, type ParsedOption } from '../../../renderer/src/format';
import { statusForReply } from '../../../renderer/src/list-rules';
import { commandFor, type Aliases } from '../../../renderer/src/phone-rows';

export type Press =
  | { kind: 'reply'; text: string }
  | { kind: 'pick'; option: ParsedOption }
  | { kind: 'close' }
  | { kind: 'later'; until: number };

export function commandForPress(press: Press, item: { product: string; id: string; status: string }, aliases: Aliases = {}) {
  const on = { product: item.product, id: item.id };
  const reply = (answer: string) => commandFor(REQUEST_CHANNELS.answer, { ...on, answer, status: statusForReply(item.status) }, aliases);
  if (press.kind === 'reply') return press.text.trim() ? reply(press.text) : null;
  if (press.kind === 'pick') {
    // "Close this task" is done, never sent: as a reply it would start a run to close it (App.tsx).
    if (closesTheTask(press.option.text)) return commandFor(REQUEST_CHANNELS.answer, { ...on, status: 'done' }, aliases);
    return reply(`Option ${press.option.n}: ${press.option.text}`);
  }
  if (press.kind === 'close') return commandFor(REQUEST_CHANNELS.answer, { ...on, status: 'done' }, aliases);
  return commandFor(REQUEST_CHANNELS.snooze, { ...on, snoozedUntil: press.until }, aliases);
}
