// THE SIDEBAR DOES NOT SAY YOU ARE IN NO ROOMS BEFORE THEY LOAD (w-3d0fa23ffb, 2026-10-22).
//
// The power tester opened the app and saw only "New room" under ROOMS: "first
// glance said I'm in no rooms". Astral was there a moment later, once the
// team's first sync had read it. Until the rooms are read, the section draws
// its heading and nothing under it, so the first thing it says is true.
// Asserted on the source, as the section is drawn by a component.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const nav = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomsNav.tsx', import.meta.url), 'utf8');
const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');

it('"New room" is drawn only once the rooms are read', () => {
  expect(nav).toMatch(/\{ready && <button type="button" className="workspace-tab rm-add"/);
});

it('the sidebar hands it whether they are', () => {
  expect(hook).toMatch(/<RoomsNav rooms=\{list\} ready=\{!!rooms\?\.ready\}/);
});
