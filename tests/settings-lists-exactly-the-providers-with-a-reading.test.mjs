// 2026-09-14: usage distracted from tasks even as text. Put all subscription
// windows at the top of Settings; cover zero, one, and both providers.
//
// THIS FILE WAS `usage-lives-in-settings-not-the-sidebar` AND ITS SECOND HALF
// WAS NEVER TRUE. It sliced App.tsx between `'<WorkspaceNavigation '` and the
// full-screen branch and asserted the slice carried no `usage=`. The tag is
// followed by a NEWLINE, so the slice was the empty string and the assertion
// passed on nothing. Meanwhile the sidebar foot approved on 2026-10-01
// (w-e731ca9376) has a usage slot in it, which is the opposite of what the
// name claimed. The wiring is now held by
// `what-is-left-of-your-limit-is-drawn-somewhere`, against a slice that is
// actually there. What was genuinely tested here, and still is, is the
// Settings panel: exactly the providers that have a reading, and nothing
// drawn as nought.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import fs from 'node:fs';
import {UsageOverview} from '../renderer/src/components/UsageOverview';
const reading=engine=>({engine,at:0,limits:[{span:'session',name:'This session',percent:38,resetsAt:3600000}]});
it.each([[],[reading('claude')],[reading('claude'),reading('codex')]].map(readings=>[readings]))('shows exactly the available providers: %j',readings=>{
 const html=renderToStaticMarkup(createElement(UsageOverview,{readings,now:0}));
 expect(html.includes('Claude Code')).toBe(readings.some(r=>r.engine==='claude'));
 expect(html.includes('Codex')).toBe(readings.some(r=>r.engine==='codex'));
 if(!readings.length) {expect(html).toContain('No usage reading yet');expect(html).not.toContain('0%');}
});
// Shortcuts left the sidebar on 2026-09-26 (w-6c5534a58d); it stays reachable
// from ⌘K, which is what this holds.
it('keeps shortcuts accessible',()=>{
 const app=fs.readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');
 expect(app).toContain("setSettingsPane('shortcuts')");
});
