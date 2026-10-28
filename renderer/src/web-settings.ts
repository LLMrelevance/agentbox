// THE COMPUTER'S SETTINGS ON THE WEB APP, read from the copy it uploads
// (phone_settings, shared/phone-settings.mjs) and changed by leaving it a
// 'setting' command, as the phone app does (mobile/src/state/settings.tsx).
import { checkSetting } from '../../shared/phone-settings.mjs';
import { settingCommand, type PhoneRows } from './phone-rows';
import { computerOf, type Change, type SettingsRow } from './phone-settings-view';

export const NOT_YET = 'Your computer has not sent its settings yet.';

type Command = PhoneRows['commands'][number];

/** The pages Settings offers on the web app: its own, and the computer's once it has sent them. */
export function webSettingsPages(computer: SettingsRow | null): Set<string> {
  const w = computer?.settings?.workspace;
  if (!w) return new Set(['appearance', 'phone']);
  const codex = (w.engines ?? []).includes('codex') || !!w.codex?.found;
  return new Set(['general', 'appearance', 'phone', 'alpha', 'claude', ...(codex ? ['codex'] : []), 'running', 'projects']);
}

/**
 * WHICH GROUPS AN AGENT'S PAGE DRAWS (F-119). It used to say "Claude Code is
 * not on this computer" and then offer its accounts and its permission mode
 * underneath: three answers where there is one, and nothing to sign in to.
 */
export function webSettingsGroups(workspace: any, engine: 'claude' | 'codex'): string[] {
  return workspace?.[engine]?.found ? ['accounts', 'permissions'] : ['status'];
}

/**
 * The second line on a project's row in the web app's Projects list. A project
 * never shared with the phone says so (F-118): its settings are still the
 * computer's to change from here, but its threads are not here.
 */
export function webProjectRow(project: { onPhone?: boolean; running?: number }): { desc: string | undefined } {
  if (project.onPhone === false) return { desc: 'Not on this phone' };
  return { desc: project.running ? `${project.running} running` : undefined };
}

/** What Settings reads: no desktop model, the computer heard from last, and every setting command, those just sent too. */
export function webSettingsModel(rows: SettingsRow[], commands: Command[], sent: Command[]) {
  const known = new Set(commands.map((c) => c.id));
  return {
    ok: true as const,
    workspace: null,
    projects: [],
    computer: computerOf(rows),
    settingCommands: [...commands, ...sent.filter((c) => !known.has(c.id))].filter((c) => c.kind === 'setting'),
  };
}

/** The account last asked of this computer. A refused reading carries only the copy's value, so its row is found from this. */
export function lastAccountAsk(commands: Command[], device: string): { engine: string; account: string | null } | null {
  const last = commands.filter((c) => c.kind === 'setting' && c.device === device && c.payload?.key === 'activeAccount')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).pop();
  return last?.payload?.value ?? null;
}

/** The command a change leaves for the computer, or why it is not sent. */
export function webSettingChange(computer: SettingsRow | null, change: Change) {
  if (!computer) return { ok: false as const, error: NOT_YET };
  const why = checkSetting(change);
  if (why) return { ok: false as const, error: why };
  return { ok: true as const, row: settingCommand(computer.device, change as Change & { value: unknown }) };
}
