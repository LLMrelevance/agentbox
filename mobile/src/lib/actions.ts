// WHAT A PRESS ON THE PHONE APP LEAVES FOR THE MAC: the phone site's own
// commands (phone-rows.ts `commandFor`), from the presses the app has. The
// choices ride as the window's handlers take them; phoneChoices keeps only
// the ones each kind of command may carry.

import { REQUEST_CHANNELS } from '../../../shared/bridge-map.mjs';
import { closesTheTask, type ParsedOption } from '../../../renderer/src/format';
import { statusForReply } from '../../../renderer/src/list-rules';
import { commandFor, type Aliases } from '../../../renderer/src/phone-rows';

export interface Choices { priority?: number; permissionMode?: string; model?: string; effort?: string; engine?: string }

export type Press =
  | { kind: 'reply'; text: string; choices?: Choices }
  | { kind: 'pick'; option: ParsedOption; choices?: Choices }
  | { kind: 'close' }
  | { kind: 'later'; until: number }
  | { kind: 'new'; product: string; body: string; choices?: Choices };

export function commandForPress(press: Press, item: { product: string; id: string; status: string } | null, aliases: Aliases = {}) {
  if (press.kind === 'new') {
    return press.body.trim() ? commandFor(REQUEST_CHANNELS.compose, { product: press.product, title: '', body: press.body, ...press.choices }, aliases) : null;
  }
  if (!item) return null;
  const on = { product: item.product, id: item.id };
  const reply = (answer: string, choices: Choices = {}) => commandFor(REQUEST_CHANNELS.answer, { ...on, ...choices, answer, status: statusForReply(item.status) }, aliases);
  if (press.kind === 'reply') return press.text.trim() ? reply(press.text, press.choices) : null;
  if (press.kind === 'pick') {
    // "Close this task" is done, never sent: as a reply it would start a run to close it (App.tsx).
    if (closesTheTask(press.option.text)) return commandFor(REQUEST_CHANNELS.answer, { ...on, status: 'done' }, aliases);
    return reply(`Option ${press.option.n}: ${press.option.text}`, press.choices);
  }
  if (press.kind === 'close') return commandFor(REQUEST_CHANNELS.answer, { ...on, status: 'done' }, aliases);
  return commandFor(REQUEST_CHANNELS.snooze, { ...on, snoozedUntil: press.until }, aliases);
}
