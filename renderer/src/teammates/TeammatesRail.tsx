// Each teammate in the sidebar under Groups: a dashed letter, the agent mark,
// with a dot when it is waiting on you. With the sidebar wide, its name and
// what it is on. The first row opens the team chat.
import type { Teammate } from '../types';
import './teammates.css';

export function TeammateMark({ t, size = 'sm', waiting = false }: { t: Pick<Teammate, 'letter' | 'name'> | null; size?: 'sm' | 'hd' | 'pic' | 'big'; waiting?: boolean }) {
  return <i className={`tq tq-${size}${t ? '' : ' tq-hash'}`} aria-hidden="true">{t ? t.letter || t.name.slice(0, 1) : '#'}{waiting && <i className="tq-wt" />}</i>;
}

export function nowLine(t: Teammate): string {
  if (t.question) return 'Has a question for you';
  if (t.status === 'draft') return 'Setting up';
  return t.now ?? (t.paused ? 'Paused' : 'Free');
}

const TEAM_ICON = <svg className="workspace-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 1.6" aria-hidden="true"><rect x="3.5" y="7.5" width="10" height="10" /><rect x="10.5" y="4.5" width="10" height="10" /></svg>;

export function TeammatesRail({ team, open, onOpen }: {
  team: Teammate[];
  /** Which page is up: 'team', a teammate's id, or nothing. */
  open: string | null;
  onOpen: (which: string) => void;
}) {
  return <nav className="workspace-tabs tq-rail" aria-label="Teammates">
    <button type="button" className={`workspace-tab tq-team${open === 'team' ? ' active' : ''}`} aria-label="Teammates" title="Teammates" onClick={() => onOpen('team')}>
      {TEAM_ICON}<span>Teammates</span>
    </button>
    {team.map((t) => (
      <button key={t.id} type="button" className={`workspace-tab tq-row${open === t.id ? ' active' : ''}`} aria-label={t.name} title={t.name} onClick={() => onOpen(t.id)}>
        <TeammateMark t={t} waiting={t.waiting.length > 0 || !!t.asking || !!t.question} />
        <span className="tq-two"><b>{t.name}</b><small>{nowLine(t)}</small></span>
      </button>
    ))}
  </nav>;
}
