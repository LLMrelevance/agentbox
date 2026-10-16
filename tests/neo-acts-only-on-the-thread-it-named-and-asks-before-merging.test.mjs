// What Neo's tool calls do in the inbox (renderer/src/neo/bridge.ts). The
// plan review (2026-10-16) found two ways a voice assistant goes wrong here:
// it acts on whatever row is open by the time the call lands rather than the
// one it was talking about, and it carries out "merge it" off a misheard word.
// So every action names a thread id and is refused if that thread is gone,
// and a pick whose words merge, ship, delete or push comes back `needs_yes`
// until the call says it was confirmed.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge, describeScreen } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Pricing page copy', status: 'open', result: 'Two drafts ready. Which one?\n\n## Options\n1. Ship draft A (recommended)\n2. Rewrite' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'Fix the login bug', status: 'open', result: 'Fixed.' },
  { id: 'w-c', product: 'p2', productName: 'Site', title: 'New hero image', status: 'open' },
];

function setup({ focused = null, list = rows } = {}) {
  const calls = [];
  const rec = (name) => vi.fn(async (...a) => { calls.push([name, ...a]); });
  const deps = {
    rows: () => list,
    focused: () => focused,
    outside: () => false,
    options: (r) => (r.id === 'w-a' ? [{ n: 1, text: 'Ship draft A (recommended)' }, { n: 2, text: 'Rewrite' }] : []),
    summary: (r) => (r.result ?? '').split('\n')[0],
    projects: () => [{ slug: 'p1', name: 'Agentbox' }, { slug: 'p2', name: 'Site' }],
    open: rec('open'), pick: rec('pick'), reply: rec('reply'), close: rec('close'),
    compose: vi.fn(async (text, product) => { calls.push(['compose', text, product]); return { id: 'w-new' }; }),
    undo: vi.fn(async () => { calls.push(['undo']); return 'done'; }),
    glow: rec('glow'),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('acting on a named thread', () => {
  it('opens the thread it named and lights it up', async () => {
    const { act, calls } = setup();
    const r = await act('open_thread', { id: 'w-b' });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['open', rows[1]]);
    expect(calls.some(([n]) => n === 'glow')).toBe(true);
  });

  it('refuses a thread that is no longer in the inbox, and touches nothing', async () => {
    const { act, calls } = setup();
    const r = await act('reply', { id: 'w-gone', text: 'hi' });
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('replies on the named thread, not on the one that is open', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('reply', { id: 'w-b', text: 'Thanks, close it after the test.' });
    expect(calls).toContainEqual(['reply', rows[1], 'Thanks, close it after the test.']);
  });

  it('closes the named thread', async () => {
    const { act, calls } = setup();
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['close', rows[2]]);
  });

  it('does not claim a close the app stopped to ask about', async () => {
    const { act, deps } = setup();
    deps.close = async () => 'asked';
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });
});

describe('picking an option', () => {
  it('asks first when the option would ship or merge', async () => {
    const { act, calls } = setup();
    const r = await act('pick_option', { id: 'w-a', n: 1 });
    expect(r).toMatchObject({ ok: false, status: 'needs_yes' });
    expect(r.said).toMatch(/Ship draft A/);
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('goes ahead once the person said yes to the option it asked about', async () => {
    const { act, calls } = setup();
    await act('pick_option', { id: 'w-a', n: 1 });
    const r = await act('pick_option', { id: 'w-a', n: 1, confirmed: true });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['pick', rows[0], 1]);
  });

  // Codex review, 2026-10-16: a bare `confirmed: true` was enough, so a yes
  // could carry out an option nobody had read out.
  it('asks anyway when the call claims a yes it never asked for', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1, confirmed: true })).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('does not let a yes carry over to an option whose words changed meanwhile', async () => {
    const { act, calls, deps } = setup();
    await act('pick_option', { id: 'w-a', n: 1 });
    deps.options = () => [{ n: 1, text: 'Delete the branch' }];
    expect(await act('pick_option', { id: 'w-a', n: 1, confirmed: true })).toMatchObject({ ok: false, status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('does not let a yes for one thread pick on another', async () => {
    const list = [rows[0], { ...rows[1], id: 'w-z' }];
    const { act, calls, deps } = setup({ list });
    deps.options = () => [{ n: 1, text: 'Ship draft A (recommended)' }];
    await act('pick_option', { id: 'w-a', n: 1 });
    expect(await act('pick_option', { id: 'w-z', n: 1, confirmed: true })).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });

  it('says so when the app asked its own question instead of picking', async () => {
    const { act, deps } = setup();
    deps.pick = async () => 'asked';
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });

  it('picks a harmless option without asking', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['pick', rows[0], 2]);
  });

  it('refuses an option number the thread does not offer', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 3 })).toMatchObject({ ok: false, status: 'refused' });
    expect(await act('pick_option', { id: 'w-b', n: 1 })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });
});

describe('moving through the inbox', () => {
  it('opens the first thread when none is open', async () => {
    const { act, calls } = setup();
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[0]]);
  });

  it('opens the one after the open thread', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[1]]);
  });

  it('says so at the end of the inbox rather than wrapping round', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    const r = await act('next_thread', {});
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'open')).toBe(false);
  });
});

describe('a new thread', () => {
  it('goes to the project named, by name or slug', async () => {
    const { act, calls } = setup();
    await act('new_thread', { text: 'Make the hero warmer', project: 'site' });
    expect(calls).toContainEqual(['compose', 'Make the hero warmer', 'p2']);
  });

  it('goes to the open thread\'s project when none is named', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    await act('new_thread', { text: 'Another one' });
    expect(calls).toContainEqual(['compose', 'Another one', 'p2']);
  });

  it('refuses a project that does not exist rather than guessing', async () => {
    const { act, calls } = setup();
    expect(await act('new_thread', { text: 'x', project: 'Nope' })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });
});

describe('what Neo is told the screen shows', () => {
  it('lists the inbox with ids, and the open thread with its summary and options', () => {
    const { deps } = setup({ focused: rows[0] });
    const s = describeScreen(deps);
    expect(s).toMatch(/w-a/);
    expect(s).toMatch(/Fix the login bug/);
    expect(s).toMatch(/Open thread: Pricing page copy/);
    expect(s).toMatch(/1\. Ship draft A/);
  });

  it('says when nothing is waiting', () => {
    const { deps } = setup({ list: [] });
    expect(describeScreen(deps)).toMatch(/nothing waiting/i);
  });

  it('keeps a long inbox short', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `w-${i}`, product: 'p1', productName: 'A', title: `Thread ${i}`, status: 'open' }));
    const { deps } = setup({ list: many });
    const s = describeScreen(deps);
    expect(s).toMatch(/Thread 0\b/);
    expect(s).not.toMatch(/Thread 39/);
    expect(s).toMatch(/40 threads/);
  });

  it('get_screen answers with the same description', async () => {
    const { act, deps } = setup();
    const r = await act('get_screen', {});
    expect(r).toMatchObject({ ok: true, said: describeScreen(deps) });
  });
});

describe('undo', () => {
  it('undoes the last thing, and says when there is nothing to undo', async () => {
    const { act, deps } = setup();
    expect(await act('undo', {})).toMatchObject({ ok: true });
    deps.undo.mockResolvedValueOnce('none');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/nothing/) });
  });

  it('leaves an old action for the person to take back with Z', async () => {
    const { act, deps } = setup();
    deps.undo.mockResolvedValueOnce('old');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/press Z/) });
  });
});

// She said "option one" and Neo still asked her to approve (2026-10-16). Her
// own words naming the option are the yes; a yes is asked for only when Neo
// is inferring the pick ("do it", "sounds good").
describe('the person naming the option is the yes', () => {
  const heard = (words) => ({ heard: words });
  it.each(['option one', 'Option 1.', 'go with the first one', 'merge it', 'yeah merge it', 'one'])('"%s" picks Merge it at once', async (words) => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1 }, heard(words.replace('merge', 'ship')))).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['pick', rows[0], 1]);
  });

  it.each(['do it', 'sounds good', 'yes', 'option two', "don't ship it", 'wait, not option one', 'what does option one do'])('"%s" still asks', async (words) => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 1 }, heard(words))).toMatchObject({ status: 'needs_yes' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });
});

describe('films and sounds in the open thread', () => {
  it('plays the one asked for and says its name', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async (action, n) => ({ name: `clip-${n}.mp4`, count: 2 }));
    expect(await act('media', { action: 'play', n: 2 })).toMatchObject({ ok: true, said: expect.stringMatching(/clip-2\.mp4/) });
    expect(deps.media).toHaveBeenCalledWith('play', 2);
  });

  it('plays the first when none is named', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async () => ({ name: 'a.mp4', count: 1 }));
    await act('media', { action: 'play' });
    expect(deps.media).toHaveBeenCalledWith('play', 1);
  });

  it('says so when the thread has none', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.media = vi.fn(async () => null);
    expect(await act('media', { action: 'play' })).toMatchObject({ ok: false, said: expect.stringMatching(/no film|nothing to play/i) });
  });

  it('lists them in what Neo is told is on screen', () => {
    const { deps } = setup({ focused: rows[0] });
    deps.mediaNames = () => ['walkthrough.mp4', 'voice-a.m4a'];
    expect(describeScreen(deps)).toMatch(/1\. walkthrough\.mp4/);
  });
});

// "When it goes into a new task, I expect it to really quickly summarize what
// I need to know" (2026-10-16). It stayed quiet: opening said only "Opened X".
describe('opening a thread hands Neo what to brief her with', () => {
  it('carries the latest from the agent and the options', async () => {
    const { act } = setup();
    const r = await act('open_thread', { id: 'w-a' });
    expect(r.said).toMatch(/Two drafts ready/);
    expect(r.said).toMatch(/1\. Ship draft A/);
  });

  it('and so does moving to the next one', async () => {
    const { act } = setup();
    const r = await act('next_thread', {});
    expect(r.said).toMatch(/Pricing page copy/);
    expect(r.said).toMatch(/Options/);
  });
});

describe('any command by name', () => {
  function withCommands(extra = {}) {
    const ran = [];
    const t = setup();
    t.deps.commands = () => [
      { id: 'pause', label: 'Pause agents', hint: 'no new sessions spawn', run: () => ran.push('pause') },
      { id: 'flip-view', label: 'Show as a board', keywords: 'view board list columns', run: () => ran.push('flip-view') },
      { id: 'done', label: 'Close Task', run: () => ran.push('done') },
      { id: 'keyhints', label: 'Turn on keyboard shortcut hints', run: () => ran.push('keyhints') },
    ];
    Object.assign(t.deps, extra);
    return { ...t, ran };
  }

  it('finds commands by her words, best first, without reading out the whole list', async () => {
    const { act } = withCommands();
    const r = await act('find_commands', { query: 'board' });
    expect(r.said).toMatch(/flip-view.*Show as a board/);
    expect(r.said).not.toMatch(/keyboard shortcut hints/);
  });

  it('puts the rare word first: "open the settings" finds Settings, not every Open', async () => {
    const { act, deps } = withCommands();
    deps.commands = () => [
      { id: 'open-terminal', label: 'Open Terminal', run: () => {} },
      { id: 'demo', label: 'Open a demo inbox', run: () => {} },
      { id: 'settings', label: 'Settings…', hint: 'the workspace, and every project', run: () => {} },
    ];
    const r = await act('find_commands', { query: 'open the settings' });
    expect(r.said.split('\n')[0]).toMatch(/\[settings\]/);
  });

  it('says when nothing matches', async () => {
    const { act } = withCommands();
    expect(await act('find_commands', { query: 'teleport' })).toMatchObject({ ok: false });
  });

  it('runs a harmless command at once', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'flip-view' })).toMatchObject({ ok: true, said: expect.stringMatching(/Show as a board/) });
    expect(ran).toEqual(['flip-view']);
  });

  it('refuses an id that is not in the list now', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'rm-rf' })).toMatchObject({ ok: false, status: 'refused' });
    expect(ran).toEqual([]);
  });

  it('asks before one that stops agents or closes work, unless her words named it', async () => {
    const { act, ran } = withCommands();
    expect(await act('run_command', { id: 'pause' }, { heard: 'do that' })).toMatchObject({ status: 'needs_yes' });
    expect(ran).toEqual([]);
    expect(await act('run_command', { id: 'pause' }, { heard: 'pause the agents' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['pause']);
  });

  it('takes a yes after asking', async () => {
    const { act, ran } = withCommands();
    await act('run_command', { id: 'done' }, { heard: 'yeah do it' });
    expect(await act('run_command', { id: 'done', confirmed: true }, { heard: 'yes' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['done']);
  });
});

describe('scrolling and showing', () => {
  it('scrolls, and says when there is nothing to scroll', async () => {
    const { act, deps } = setup();
    deps.scroll = vi.fn(() => true);
    expect(await act('scroll', { where: 'up' })).toMatchObject({ ok: true });
    expect(deps.scroll).toHaveBeenCalledWith('up');
    deps.scroll = () => false;
    expect(await act('scroll', { where: 'up' })).toMatchObject({ ok: false });
  });

  it('shows the pictures she named in the layout she asked for', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['a.png', 'b.png', 'c.png'];
    deps.show = vi.fn(async () => true);
    expect(await act('show', { pictures: [1, 3], layout: 'side_by_side' })).toMatchObject({ ok: true });
    expect(deps.show).toHaveBeenCalledWith([1, 3], 'side_by_side');
  });

  it('refuses a picture number the thread does not have', async () => {
    const { act, deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['a.png'];
    deps.show = vi.fn(async () => true);
    expect(await act('show', { pictures: [1, 3], layout: 'side_by_side' })).toMatchObject({ ok: false, said: expect.stringMatching(/1 picture/) });
    expect(deps.show).not.toHaveBeenCalled();
  });

  it('lists the pictures in what Neo is told is on screen', () => {
    const { deps } = setup({ focused: rows[0] });
    deps.pictureNames = () => ['round9.png', 'round10.png'];
    expect(describeScreen(deps)).toMatch(/Pictures:\n1\. round9\.png/);
  });
});

describe('what Neo reads of an agent\'s words', () => {
  it('names a picture rather than spelling out its address, and drops markdown', async () => {
    const { act, deps } = setup();
    deps.summary = () => '**Three drafts.** ![design 1](data:image/png;base64,AAAA) and [the doc](https://x.y/z)';
    const r = await act('open_thread', { id: 'w-a' });
    expect(r.said).toMatch(/Three drafts\. \[picture: design 1\] and the doc/);
    expect(r.said).not.toMatch(/base64|https|\*\*/);
  });
});
