// THE COMPUTER'S SETTINGS ON THE WEB APP, read from the copy it uploads
// (phone_settings, shared/phone-settings.mjs) and changed by leaving it a
// 'setting' command, as the phone app does (mobile/src/state/settings.tsx).
import { checkSetting } from '../../shared/phone-settings.mjs';
import { settingCommand, splitSlug, type PhoneRows } from './phone-rows';
import { ENGINES } from '../../shared/engines.mjs';
import { CLAUDE_MODELS } from '../../shared/claude-models.generated.mjs';
import { Name } from '../../shared/product-name.mjs';
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

/** What Settings reads: no desktop model, the computer heard from last, and every setting command, those just sent too. */
export function webSettingsModel(rows: SettingsRow[], commands: Command[], sent: Command[], projects?: { device: string }[]) {
  const known = new Set(commands.map((c) => c.id));
  return {
    ok: true as const,
    workspace: phoneModelSettings(projects ? rows.filter(r => projects.some(p => p.device === r.device)) : rows),
    projects: [],
    computer: computerOf(rows),
    settingCommands: [...commands, ...sent.filter((c) => !known.has(c.id))].filter((c) => c.kind === 'setting'),
  };
}

export function phoneModelSettings(rows: SettingsRow[]) {
  const w = computerOf(rows)?.settings?.workspace;
  if (!w || !Array.isArray(w.codexModels)) return null;
  const models = new Map(rows.flatMap(r => r.settings?.workspace?.codexModels ?? []).map((m: any) => [m.id, m]));
  return { claudeModels: w.claudeModels, codexModels: [...models.values()], codexModelDefault: w.codexModelDefault ?? null, codexFreePlan: w.codexFreePlan };
}

export function phoneEngines(rows: SettingsRow[], projects: { device: string }[], items: { id: string; product: string; engine?: string }[]) {
  const shared = rows.filter(r => projects.some(p => p.device === r.device));
  const workspace = computerOf(shared)?.settings?.workspace;
  const choices = ENGINES.filter(e => shared.some(r => r.settings?.workspace?.engines?.includes(e.id)));
  const home = (w: any) => w?.engines?.includes(w.engine) ? w.engine : w?.engines?.[0] ?? 'claude';
  const byItem: Record<string, string> = {};
  for (const item of items) {
    const w = shared.find(r => r.device === splitSlug(item.product)?.device)?.settings?.workspace;
    byItem[item.id] = w?.engines?.includes(item.engine) ? item.engine! : home(w);
  }
  return { choices, workspace: home(workspace), byItem };
}

export function phoneModelRefusal(w: any, pick: { engine?: string | null; model?: string | null }) {
  if (!w || !Array.isArray(w.codexModels)) return `Your computer has not sent its model settings yet. Update ${Name} there and try again.`;
  const model = pick.model;
  const claude = !!model && (model.startsWith('claude-') || CLAUDE_MODELS.some(m => m.alias === model) || w.claudeModels?.some((m: any) => m.id === model || m.model === model));
  const codex = !!model && (model.startsWith('gpt-') || model === w.codexModelDefault || w.codexModels.some((m: any) => m.id === model));
  const engine = pick.engine ?? (claude ? 'claude' : codex ? 'codex' : (w.engines?.includes(w.engine) ? w.engine : w.engines?.[0]));
  if (claude && engine === 'codex') return `Claude Code model "${model}" is not available in Codex. Pick a Codex model before sending.`;
  if (codex && engine === 'claude') return `Codex model "${model}" is not available in Claude Code. Pick a Claude model before sending.`;
  const label = engine === 'codex' ? 'Codex' : 'Claude Code';
  if (!w.engines?.includes(engine)) return `${label}${model ? ` model "${model}"` : ''} is not available on this computer. Pick another model before sending.`;
  if (engine === 'codex' && model && model !== w.codexModelDefault && !w.codexModels.some((m: any) => m.id === model)) return `Codex model "${model}" is not offered by this computer. Pick another model before sending.`;
  return null;
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
