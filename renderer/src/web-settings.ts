// THE COMPUTER'S SETTINGS ON THE WEB APP, read from the copy it uploads
// (phone_settings, shared/phone-settings.mjs) and changed by leaving it a
// 'setting' command, as the phone app does (mobile/src/state/settings.tsx).
import { checkSetting } from '../../shared/phone-settings.mjs';
import { DEFAULT_ENGINE, ENGINES, isEngine, type Engine } from '../../shared/engines.mjs';
import { settingCommand, type PhoneRows } from './phone-rows';
import { computerOf, type Change, type SettingsRow } from './phone-settings-view';
import type { ModelChoice } from './models';

export const NOT_YET = 'Your computer has not sent its settings yet.';

type Command = PhoneRows['commands'][number];

/**
 * THE CODING AGENTS THE COMPUTER OFFERS, off its settings copy, for the To
 * field on the web app and the phone app (w-24119e8784: both offered Claude
 * Code alone, so To read "Agent" on a Mac with Codex). No copy, or one from a
 * Mac too old to say, offers Claude Code alone, which is what they drew before.
 */
export function computerAgents(computer: SettingsRow | null): { engines: Engine[]; workspace: string; codexModels: ModelChoice[]; codexDefault: string | null } {
  const w = computer?.settings?.workspace;
  const ids: unknown[] = Array.isArray(w?.engines) ? w.engines : [];
  const engines = ENGINES.filter((e) => ids.includes(e.id));
  const codexModels = Array.isArray(w?.codexModels) ? w.codexModels.filter((m: any) => typeof m?.id === 'string' && m.id) : [];
  return {
    engines: engines.length ? engines : ENGINES.filter((e) => e.id === DEFAULT_ENGINE),
    workspace: isEngine(w?.engine) ? w.engine : DEFAULT_ENGINE,
    codexModels,
    codexDefault: typeof w?.codexModelDefault === 'string' && w.codexModelDefault ? w.codexModelDefault : null,
  };
}

/** The snapshot's `engines` on the web app, as the desktop's reads; null until the computer has sent its settings. */
export function webEngines(computer: SettingsRow | null) {
  if (!computer?.settings?.workspace) return null;
  const agents = computerAgents(computer);
  return { choices: agents.engines, workspace: agents.workspace, byItem: {} as Record<string, string> };
}

/** Codex's models as a settings read gives them: the desktop's own model, else the computer's copy (the web app has no desktop model). */
export function codexFromSettings(s: { workspace?: any; computer?: SettingsRow | null }): { models: ModelChoice[] | null; defaultModel: string | null } {
  if (Array.isArray(s.workspace?.codexModels)) return { models: s.workspace.codexModels, defaultModel: s.workspace.codexModelDefault ?? null };
  if (!s.computer?.settings?.workspace) return { models: null, defaultModel: null };
  const agents = computerAgents(s.computer);
  return { models: agents.codexModels, defaultModel: agents.codexDefault };
}

/** The pages Settings offers on the web app: its own, and the computer's once it has sent them. */
export function webSettingsPages(computer: SettingsRow | null): Set<string> {
  const w = computer?.settings?.workspace;
  if (!w) return new Set(['appearance', 'phone']);
  const codex = (w.engines ?? []).includes('codex') || !!w.codex?.found;
  return new Set(['general', 'appearance', 'phone', 'alpha', 'claude', ...(codex ? ['codex'] : []), 'running', 'projects']);
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
