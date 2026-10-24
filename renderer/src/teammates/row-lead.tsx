// A thread a teammate's run sent you says whose it is before its title.
import { createContext, useContext } from 'react';
import type { Teammate, WorkItem } from '../types';
import { teammateIdOf } from '../../../shared/teammates.mjs';
import { TeammateMark } from './TeammatesRail';

export const TeammatesContext = createContext<Map<string, Teammate>>(new Map());

export function TeammateLead({ item }: { item: Pick<WorkItem, 'labels'> }) {
  const team = useContext(TeammatesContext);
  const id = teammateIdOf(item);
  const t = id ? team.get(id) : undefined;
  if (!t) return null;
  return <span className="tq-from"><TeammateMark t={t} /><b>{t.name}</b></span>;
}
